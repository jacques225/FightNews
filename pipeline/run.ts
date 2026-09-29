/** Flux RSS français → titre, court extrait, photo et source → Supabase. Aucun appel à une IA. */
import { createClient } from "@supabase/supabase-js";
import { MAX_NEW_PER_RUN, eachSource, imageOf, itemDate, publisherOf, readFeed, snippetOf, type Source } from "./feeds";
import { excerpt, isRepeat, sportOf, isCombatNews } from "./without-ai";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_AGE_HOURS = 48;

type Item = { title: string; link: string; snippet: string; image?: string; date: string; publisher: string; source: Source };

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
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

/** Garde la trace d'une info écartée (hors sujet, doublon) pour ne pas la retraiter au prochain passage. */
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
  // Une configuration manquante doit être visible dans Actions, sans faux succès.
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]?.trim());
  if (!DRY_RUN && missing.length) {
    console.error(`Secret manquant : ${missing.join(", ")}. À ajouter dans Settings > Secrets and variables > Actions, onglet Secrets.`);
    process.exit(1);
  }
  console.log("Mode RSS français : aucun service IA, aucune traduction automatique.");

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
    if (isRepeat(recent, item.title) || (item.source.mixed && !isCombatNews(item.title, item.snippet))) {
      const reason = isRepeat(recent, item.title) ? "doublon" : "hors-sujet";
      console.log(`  écarté (${reason}) : ${item.title}`);
      await markRejected(item, reason);
      continue;
    }
    const title = item.title.trim().slice(0, 300);
    const content = { title, summary: excerpt(item.snippet, title), body: "", sport: sportOf(title, item.source.sport), tags: [] };
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
    if (!supabase) throw new Error("Supabase absent.");
    const { error } = await supabase.from("articles").insert(row);
    if (error) throw error;
    console.log(`  ✓ ${row.sport} : ${row.title}`);
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
