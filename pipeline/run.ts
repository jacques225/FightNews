/**
 * Pipeline FightNews
 * 1. lit les flux RSS de pipeline/sources.json
 * 2. ignore les liens déjà traités (publiés, en brouillon ou écartés)
 * 3. demande à l'IA un résumé original en français + la rubrique + des tags,
 *    en lui donnant les titres déjà publiés pour qu'elle écarte les doublons.
 *    Sans clé Claude (ou si Claude la refuse), reprend le titre et un court extrait de la source
 * 4. enregistre dans Supabase (en brouillon par défaut), avec la photo que le média fournit dans son flux
 *
 * Usage : npm run pipeline          (normal)
 *         npm run pipeline:dry      (affiche ce qui serait fait, n'écrit rien)
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { MAX_NEW_PER_RUN, eachSource, imageOf, itemDate, publisherOf, readFeed, snippetOf, type Source } from "./feeds";
import { SPORTS } from "../lib/sports";
import { excerpt, isRepeat, sportOf } from "./without-ai";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_AGE_HOURS = 48;

type Item = { title: string; link: string; snippet: string; image?: string; date: string; publisher: string; source: Source };

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
// L'IA est facultative : sans clé Claude, les brèves reprennent le titre et un extrait de la source.
let ai = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic() : null;
const MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const STATUS = process.env.PIPELINE_DEFAULT_STATUS === "published" ? "published" : "draft";

async function fetchAll(): Promise<Item[]> {
  const perSource = await eachSource(async (source) => {
    const items: Item[] = [];
    try {
      const feed = await readFeed(source.url);
      for (const it of feed.items) {
        if (!it.link || !it.title) continue;
        const date = itemDate(it.isoDate ?? it.pubDate);
        if (Date.now() - new Date(date).getTime() > MAX_AGE_HOURS * 3600_000) continue;
        const { publisher, title } = publisherOf(it.sourceEl, it.title, source.name);
        const snippet = snippetOf(it.content, it.contentSnippet).slice(0, 1500);
        items.push({ title, link: it.link, snippet, image: imageOf(it), date, publisher, source });
      }
      console.log(`✓ ${source.name} : ${feed.items.length} entrées`);
    } catch (e) {
      console.warn(`✗ ${source.name} : ${(e as Error).message}`);
    }
    return items;
  });
  return perSource.flat();
}

/** Liens déjà en base (publiés, en brouillon ou écartés), avec pour chacun : reste-t-il une photo à ajouter ? */
async function knownLinks(items: Item[]): Promise<Map<string, boolean>> {
  const known = new Map<string, boolean>();
  if (!supabase) return known;
  for (let i = 0; i < items.length; i += 200) {
    const { data, error } = await supabase
      .from("articles")
      .select("source_url, image_url, status")
      .in("source_url", items.slice(i, i + 200).map((u) => u.link));
    if (error) throw error;
    data.forEach((r) => known.set(r.source_url, !r.image_url && r.status !== "rejected"));
  }
  return known;
}

/** Infos déjà enregistrées sans photo (avant que le robot reprenne celles des flux) : on ajoute celle du flux. */
async function addMissingImages(items: Item[], known: Map<string, boolean>) {
  if (!supabase || DRY_RUN) return;
  let added = 0;
  for (const item of items) {
    if (!item.image || !known.get(item.link)) continue;
    const { error } = await supabase.from("articles").update({ image_url: item.image }).eq("source_url", item.link).is("image_url", null);
    if (error) console.warn(`  photo non ajoutée (${item.link}) : ${error.message}`);
    else added++;
  }
  if (added) console.log(`${added} photos ajoutées à des infos déjà enregistrées`);
}

/** Titres publiés ou en brouillon ces dernières 48 h, par rubrique : sert à repérer les doublons. */
async function recentTitles(): Promise<Map<string, string[]>> {
  const bySport = new Map<string, string[]>();
  if (!supabase) return bySport;
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("articles")
    .select("title, sport")
    .in("status", ["draft", "published"])
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) console.warn(`Titres récents indisponibles : ${error.message}`);
  for (const r of data ?? []) remember(bySport, r.sport, r.title);
  return bySport;
}

function remember(bySport: Map<string, string[]>, sport: string, title: string) {
  const list = bySport.get(sport) ?? [];
  if (list.length < 40) list.push(title);
  bySport.set(sport, list);
}

const SYSTEM = `Tu es rédacteur pour FightNews, un site français d'actualité des sports de combat.
À partir du titre et de l'extrait d'une source, tu écris une brève ORIGINALE en français.
Règles :
- Ne recopie jamais de phrases de la source ; reformule avec tes mots.
- N'invente aucun fait, score, date ou citation absent de l'extrait.
- Ton neutre et factuel. "body" fait 40 à 150 mots selon l'information disponible : si l'extrait est maigre, écris une brève courte plutôt que de broder.
- "sport" est la rubrique, une de ces valeurs :
${SPORTS.map((s) => `  - ${s.slug} : ${s.name} (${s.description})`).join("\n")}
  ou "hors-sujet" si l'info ne concerne pas les sports de combat ni leur univers,
  ou "doublon" si la même information figure déjà dans la liste "Déjà publié" (même événement, même annonce).
- "lifestyle" couvre l'équipement, les vêtements, les chaussures, les collaborations de marques et la culture fight.
  Un résultat ou une annonce de combat va dans le sport concerné, jamais en lifestyle.
- En lifestyle, reste informatif, sans ton publicitaire ; ne donne un prix ou une date de sortie que s'ils sont dans l'extrait.
- Une source officielle (fédération, organisation) fait foi : reprends fidèlement ses résultats et ses dates.
Réponds uniquement avec un objet JSON : {"title": string, "summary": string (1 phrase), "body": string, "sport": string, "tags": string[] (3 max)}`;

type Rewrite = { title: string; summary: string; body: string; sport: string; tags: string[] };

async function rewrite(client: Anthropic, item: Item, alreadyPublished: string[]): Promise<Rewrite | null> {
  const published = alreadyPublished.length ? alreadyPublished.map((t) => `- ${t}`).join("\n") : "(rien)";
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM,
    messages: [{
      role: "user",
      content:
        `Média : ${item.publisher}${item.source.official ? " (source officielle)" : ""}\n` +
        `Rubrique suggérée : ${item.source.sport}\n` +
        `Titre : ${item.title}\n` +
        `Extrait : ${item.snippet || "(aucun)"}\n\n` +
        `Déjà publié dans cette rubrique ces dernières 48 h :\n${published}`,
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

/** La clé ou le compte Claude bloque (clé refusée, plus de crédit) : inutile d'insister pendant ce passage. */
function aiUnavailable(e: unknown) {
  return e instanceof Anthropic.APIError && (e.status === 401 || e.status === 403 || (e.status === 400 && /credit balance/i.test(e.message)));
}

/** Garde la trace d'une info écartée (hors sujet, doublon) pour ne pas la repayer au prochain passage. */
async function markRejected(item: Item, reason: string) {
  if (!supabase) return;
  const { error } = await supabase.from("articles").insert({
    slug: `ecarte-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: item.title.slice(0, 300),
    summary: "",
    body: "",
    sport: reason.slice(0, 40),
    source_name: item.publisher,
    source_url: item.link,
    published_at: item.date,
    status: "rejected",
  });
  if (error) console.warn(`  impossible de noter l'écart : ${error.message}`);
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

async function main() {
  // Sur GitHub, un secret absent ne doit pas donner un passage au vert qui n'enregistre rien
  // (ni des brèves payées à l'IA puis perdues) : on s'arrête en rouge en nommant le secret.
  // La clé Claude, elle, est facultative.
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]?.trim());
  if (process.env.CI && !DRY_RUN && missing.length) {
    console.error(`Secret manquant : ${missing.join(", ")}. À ajouter dans Settings > Secrets and variables > Actions, onglet Secrets.`);
    process.exit(1);
  }
  if (!ai) console.log("Sans clé Claude : chaque info est enregistrée avec son titre, un court extrait et le lien de sa source.\n");

  const all = await fetchAll();
  const unique = [...new Map(all.map((i) => [i.link, i])).values()];
  const known = await knownLinks(unique);
  await addMissingImages(unique, known);
  // Les plus récentes d'abord : si le plafond est atteint, ce sont les plus anciennes qui attendent.
  const fresh = unique
    .filter((i) => !known.has(i.link))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_NEW_PER_RUN);
  console.log(`\n${all.length} entrées récentes, ${fresh.length} nouvelles à traiter${DRY_RUN ? " (dry-run)" : ""}\n`);
  const recent = await recentTitles();

  for (const item of fresh) {
    if (DRY_RUN) {
      console.log(`• [${item.source.sport}]${item.source.official ? " [officiel]" : ""} ${item.title} (${item.publisher})\n  ${item.link}`);
      if (item.image) console.log(`  photo : ${item.image}`);
      continue;
    }
    let r: Rewrite | null = null;
    if (ai) {
      try {
        r = await rewrite(ai, item, recent.get(item.source.sport) ?? []);
        if (!r) continue; // réponse illisible : on réessaiera au prochain passage
      } catch (e) {
        if (!aiUnavailable(e)) throw e;
        console.warn(`IA indisponible (${(e as Error).message}) : la suite du passage se fait sans IA.`);
        ai = null;
      }
    }

    // La brève : rédigée par l'IA, ou sans IA le titre et un court extrait de la source.
    let content: { title: string; summary: string; body: string; sport: string; tags: string[] };
    if (r) {
      const sport = r.sport;
      if (!SPORTS.some((s) => s.slug === sport)) {
        console.log(`  écarté (${sport}) : ${item.title}`);
        await markRejected(item, sport);
        continue;
      }
      content = { title: r.title, summary: r.summary, body: r.body, sport, tags: (r.tags ?? []).slice(0, 3) };
    } else {
      if (isRepeat(recent, item.title)) {
        console.log(`  écarté (doublon) : ${item.title}`);
        await markRejected(item, "doublon");
        continue;
      }
      const title = item.title.trim().slice(0, 300);
      content = { title, summary: excerpt(item.snippet, title), body: "", sport: sportOf(title, item.source.sport), tags: [] };
    }
    const row = {
      slug: `${slugify(content.title)}-${Date.now().toString(36)}`,
      ...content,
      image_url: item.image ?? null, // photo fournie par le média dans son flux, affichée depuis son serveur
      source_name: item.publisher,
      source_url: item.link,
      source_official: Boolean(item.source.official),
      published_at: item.date,
      status: STATUS,
    };
    if (!supabase) {
      console.log(row);
      continue;
    }
    const { error } = await supabase.from("articles").insert(row);
    console.log(error ? `  ✗ ${error.message}` : `  ✓ ${row.sport} : ${row.title}`);
    if (!error) {
      remember(recent, row.sport, row.title);
      if (row.sport !== item.source.sport) remember(recent, item.source.sport, row.title);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
