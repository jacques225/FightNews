/**
 * Pipeline FightNews
 * 1. lit les flux RSS de pipeline/sources.json
 * 2. ignore les liens déjà traités
 * 3. demande à l'IA un résumé original en français + la section + des tags
 * 4. enregistre dans Supabase (en brouillon par défaut)
 *
 * Usage : npm run pipeline          (normal)
 *         npm run pipeline:dry      (affiche ce qui serait fait, n'écrit rien)
 */
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import sources from "./sources.json";
import { SPORTS } from "../lib/sports";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_NEW_PER_RUN = 25; // plafond pour maîtriser le coût IA
const MAX_AGE_HOURS = 48;

type Source = { name: string; url: string; sport: string };
type Item = { title: string; link: string; snippet: string; date: string; publisher: string; source: Source };
type SourceEl = string | { _?: string; $?: { url?: string } };

const parser = new Parser<Record<string, never>, { sourceEl?: SourceEl }>({
  timeout: 15000,
  headers: { "User-Agent": "FightNewsBot/1.0 (+https://ton-site.fr)" },
  customFields: { item: [["source", "sourceEl"]] },
});

// Google Actualités indique le vrai média dans <source> et à la fin du titre ("Titre - L'Équipe").
// On cite ce média plutôt que "Google Actualités".
function publisherOf(el: SourceEl | undefined, title: string, fallback: string) {
  const name = typeof el === "string" ? el : el?._;
  if (name?.trim()) return { publisher: name.trim(), title: title.replace(new RegExp(`\\s+-\\s+${escapeRe(name.trim())}$`), "") };
  return { publisher: fallback, title };
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
const ai = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const STATUS = process.env.PIPELINE_DEFAULT_STATUS === "published" ? "published" : "draft";

async function fetchAll(): Promise<Item[]> {
  const items: Item[] = [];
  for (const source of sources as Source[]) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const it of feed.items) {
        if (!it.link || !it.title) continue;
        const date = it.isoDate ?? it.pubDate ?? new Date().toISOString();
        if (Date.now() - new Date(date).getTime() > MAX_AGE_HOURS * 3600_000) continue;
        const { publisher, title } = publisherOf(it.sourceEl, it.title, source.name);
        items.push({
          title,
          link: it.link,
          snippet: (it.contentSnippet ?? "").slice(0, 1500),
          date,
          publisher,
          source,
        });
      }
      console.log(`✓ ${source.name} : ${feed.items.length} entrées`);
    } catch (e) {
      console.warn(`✗ ${source.name} : ${(e as Error).message}`);
    }
  }
  return items;
}

async function filterNew(items: Item[]): Promise<Item[]> {
  const unique = [...new Map(items.map((i) => [i.link, i])).values()];
  if (!supabase) return unique;
  const { data } = await supabase.from("articles").select("source_url").in("source_url", unique.map((i) => i.link));
  const seen = new Set((data ?? []).map((r) => r.source_url));
  return unique.filter((i) => !seen.has(i.link));
}

const SYSTEM = `Tu es rédacteur pour FightNews, un site français d'actualité des sports de combat.
À partir du titre et de l'extrait d'une source, tu écris une brève ORIGINALE en français.
Règles :
- Ne recopie jamais de phrases de la source ; reformule avec tes mots.
- N'invente aucun fait, score, date ou citation absent de l'extrait.
- Ton neutre et factuel. "body" fait 40 à 150 mots selon l'information disponible : si l'extrait est maigre, écris une brève courte plutôt que de broder.
- "sport" doit être une de ces valeurs : ${SPORTS.map((s) => s.slug).join(", ")}, ou "hors-sujet" si ce n'est pas du sport de combat.
Réponds uniquement avec un objet JSON : {"title": string, "summary": string (1 phrase), "body": string, "sport": string, "tags": string[] (3 max)}`;

type Rewrite = { title: string; summary: string; body: string; sport: string; tags: string[] };

async function rewrite(item: Item): Promise<Rewrite | null> {
  if (!ai) return null;
  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Média : ${item.publisher}\nSection suggérée : ${item.source.sport}\nTitre : ${item.title}\nExtrait : ${item.snippet || "(aucun)"}`,
    }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(json) as Rewrite;
  } catch {
    console.warn(`  réponse IA illisible pour ${item.link}`);
    return null;
  }
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

async function main() {
  const all = await fetchAll();
  const fresh = (await filterNew(all)).slice(0, MAX_NEW_PER_RUN);
  console.log(`\n${all.length} entrées récentes, ${fresh.length} nouvelles à traiter${DRY_RUN ? " (dry-run)" : ""}\n`);

  for (const item of fresh) {
    if (DRY_RUN || !ai) {
      console.log(`• [${item.source.sport}] ${item.title} (${item.publisher})\n  ${item.link}`);
      continue;
    }
    const r = await rewrite(item);
    if (!r || !SPORTS.some((s) => s.slug === r.sport)) {
      console.log(`  ignoré (${r?.sport ?? "erreur"}) : ${item.title}`);
      continue;
    }
    const row = {
      slug: `${slugify(r.title)}-${Date.now().toString(36)}`,
      title: r.title,
      summary: r.summary,
      body: r.body,
      sport: r.sport,
      tags: r.tags.slice(0, 3),
      image_url: null, // les photos des sources ne sont pas réutilisées (droits d'auteur)
      source_name: item.publisher,
      source_url: item.link,
      published_at: item.date,
      status: STATUS,
    };
    if (!supabase) {
      console.log(row);
      continue;
    }
    const { error } = await supabase.from("articles").insert(row);
    console.log(error ? `  ✗ ${error.message}` : `  ✓ ${r.sport} : ${r.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
