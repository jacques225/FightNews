/** Flux RSS → brèves originales françaises → Supabase. */
import { createClient } from "@supabase/supabase-js";
import { MAX_NEW_PER_RUN, eachSource, itemDate, publisherOf, readFeed, snippetOf, type Source } from "./feeds";
import { SPORTS } from "../lib/sports";
import { rewrite, type Brief } from "./rewrite";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_AGE_HOURS = 48;
const STATUS = process.env.PIPELINE_DEFAULT_STATUS === "published" ? "published" : "draft";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
type Item = { title: string; link: string; snippet: string; date: string; publisher: string; source: Source; existingId?: string };

async function fetchAll(): Promise<Item[]> {
  const batches = await eachSource(async (source) => {
    try {
      const feed = await readFeed(source.url);
      console.log(`✓ ${source.name} : ${feed.items.length} entrées`);
      return feed.items.flatMap((it): Item[] => {
        if (!it.link || !it.title) return [];
        const date = itemDate(it.isoDate ?? it.pubDate);
        if (Date.now() - new Date(date).getTime() > MAX_AGE_HOURS * 3600_000) return [];
        const { publisher, title } = publisherOf(it.sourceEl, it.title, source.name);
        return [{ title, link: it.link, snippet: snippetOf(it.content, it.contentSnippet).slice(0, 1500), date, publisher, source }];
      });
    } catch (e) {
      console.warn(`✗ ${source.name} : ${(e as Error).message}`);
      return [];
    }
  });
  return [...new Map(batches.flat().map((i) => [i.link, i])).values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function selectItems(all: Item[]): Promise<Item[]> {
  if (!supabase) return all.slice(0, MAX_NEW_PER_RUN);
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i += 200) {
    const { data, error } = await supabase.from("articles").select("source_url")
      .in("source_url", all.slice(i, i + 200).map((item) => item.link));
    if (error) throw error;
    data.forEach((r) => seen.add(r.source_url));
  }
  // Complète aussi les anciens extraits, même s'ils ont disparu des flux RSS.
  // Leur URL et leur statut sont conservés. Cinq places minimum leur sont réservées.
  const { data, error } = await supabase.from("articles")
    .select("id,title,summary,source_url,source_name,source_official,published_at,sport")
    .eq("body", "").in("status", ["draft", "published"])
    .order("published_at", { ascending: false }).limit(MAX_NEW_PER_RUN);
  if (error) throw error;
  const byLink = new Map(all.map((i) => [i.link, i]));
  const backlog: Item[] = data.map((r) => ({
    ...(byLink.get(r.source_url) ?? {
      title: r.title, snippet: r.summary, link: r.source_url, date: r.published_at, publisher: r.source_name,
      source: { name: r.source_name, url: r.source_url, sport: r.sport, official: r.source_official },
    }),
    existingId: r.id,
  }));
  const fresh = all.filter((i) => !seen.has(i.link)).slice(0, MAX_NEW_PER_RUN - Math.min(5, backlog.length));
  return [...fresh, ...backlog.slice(0, MAX_NEW_PER_RUN - fresh.length)];
}

async function recentTitles(): Promise<Map<string, string[]>> {
  const bySport = new Map<string, string[]>();
  if (!supabase) return bySport;
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase.from("articles").select("title,sport")
    .in("status", ["draft", "published"]).gte("published_at", since)
    .order("published_at", { ascending: false }).limit(500);
  if (error) throw error;
  for (const r of data) remember(bySport, r.sport, r.title);
  return bySport;
}

function remember(recent: Map<string, string[]>, sport: string, title: string) {
  const titles = recent.get(sport) ?? [];
  if (titles.length < 40) titles.push(title);
  recent.set(sport, titles);
}
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

async function save(item: Item, brief: Brief) {
  if (!supabase) throw new Error("Supabase absent : aucun appel payant ne doit être lancé sans base.");
  const rejected = !SPORTS.some((s) => s.slug === brief.sport);
  if (item.existingId) {
    // Les éléments écartés restent en base pour révision, sans bloquer la reprise suivante.
    // Le texte et la rubrique d'origine sont conservés dans ce cas.
    const { data, error } = await supabase.from("articles").update(rejected ? { status: "rejected" } : brief)
      .eq("id", item.existingId).eq("body", "").in("status", ["draft", "published"]).select("id");
    if (error) throw error;
    if (!data.length) throw new Error("Article modifié entre-temps : mise à jour non appliquée.");
    return;
  }
  const { error } = await supabase.from("articles").insert({
    ...brief, slug: `${slugify(brief.title)}-${Date.now().toString(36)}`,
    image_url: null, source_name: item.publisher, source_url: item.link,
    source_official: Boolean(item.source.official), published_at: item.date,
    status: rejected ? "rejected" : STATUS,
  });
  if (error) throw error;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!DRY_RUN) {
    const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]
      .filter((key) => !process.env[key]?.trim());
    if (missing.length) throw new Error(`Secrets manquants : ${missing.join(", ")}. Ajouter dans GitHub > Settings > Secrets and variables > Actions.`);
  }
  const all = await fetchAll();
  const items = await selectItems(all);
  console.log(`${all.length} entrées récentes, ${items.length} brèves à rédiger (nouvelles ou à compléter)${DRY_RUN ? " — simulation sans IA ni écriture" : ""}`);
  const recent = DRY_RUN ? new Map<string, string[]>() : await recentTitles();
  for (const item of items) {
    if (DRY_RUN) { console.log(`• ${item.existingId ? "À compléter" : "Nouvelle"} : ${item.title}`); continue; }
    // Pas de repli en anglais ni de clé Anthropic : une erreur bloque ce passage et sera visible dans Actions.
    const brief = await rewrite({
      title: item.title, snippet: item.snippet, publisher: item.publisher,
      sport: item.source.sport, official: item.source.official, date: item.date,
    }, item.existingId ? [] : recent.get(item.source.sport) ?? [], {
      apiKey: apiKey!, model: process.env.OPENAI_MODEL,
    });
    await save(item, brief);
    const rejected = !SPORTS.some((s) => s.slug === brief.sport);
    console.log(`✓ ${rejected ? "Écartée" : item.existingId ? "Complétée" : "Enregistrée"} : ${brief.title}`);
    if (!rejected) remember(recent, brief.sport, brief.title);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Échec du pipeline"); process.exitCode = 1; });
