/** Flux RSS français → titre, court extrait, photo et source → Supabase. Aucun appel à une IA. */
import { createClient } from "@supabase/supabase-js";
import { MAX_NEW_PER_RUN, eachSource, itemDate, publisherOf, readSource, snippetOf, MissingKeyError, currentVideos, imageOf, type Source } from "./feeds";
import { excerpt, fullText, isRepeat, sportOf, isCombatNews } from "./without-ai";
import { previewImage } from "./preview";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_AGE_HOURS = 48;
// Une chaîne YouTube très active (ONE Championship : une dizaine de vidéos par jour) ne doit pas
// occuper toute la place d'un passage : au plus 2 nouvelles vidéos par chaîne et par passage.
const MAX_VIDEOS_PER_CHANNEL = 2;
// Infos déjà enregistrées sans photo dont on cherche la photo d'aperçu à chaque passage.
const PREVIEWS_PER_RUN = 20;
// image_url vaut "" quand la page de l'article a été lue sans y trouver de photo : on ne la relit pas.
const NO_PREVIEW = "";

type Item = { title: string; link: string; snippet: string; full?: string; image?: string; date: string; publisher: string; source: Source };

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
const STATUS = process.env.PIPELINE_DEFAULT_STATUS === "published" ? "published" : "draft";

async function fetchAll(): Promise<Item[]> {
  let skippedYouTube = 0;
  const perSource = await eachSource(async (source) => {
    const items: Item[] = [];
    try {
      const feed = await readSource(source);
      for (const it of feed.items) {
        if (!it.link || !it.title) continue;
        const date = itemDate(it.isoDate ?? it.pubDate);
        if (Date.now() - new Date(date).getTime() > MAX_AGE_HOURS * 3600_000) continue;
        const { publisher, title } = publisherOf(it.sourceEl, it.title, source.name);
        const snippet = snippetOf(it.content, it.contentSnippet, it["content:encoded"], it["content:encodedSnippet"]).slice(0, 1500);
        const full = source.fullText ? fullText(it["content:encoded"] ?? it.content) : undefined;
        items.push({ title, link: it.link, snippet, full, image: imageOf(it), date, publisher, source });
      }
      console.log(`✓ ${source.name} : ${feed.items.length} entrées`);
    } catch (e) {
      if (e instanceof MissingKeyError) skippedYouTube++;
      else console.warn(`✗ ${source.name} : ${(e as Error).message}`);
    }
    return items;
  });
  if (skippedYouTube) console.warn(`⚠ ${skippedYouTube} chaînes YouTube ignorées : secret YOUTUBE_API_KEY absent (voir le README, « Les sources »).`);
  return perSource.flat();
}

/** Garde au plus MAX_VIDEOS_PER_CHANNEL nouvelles vidéos par chaîne, les plus récentes. */
function capVideos(items: Item[]): Item[] {
  const perChannel = new Map<string, number>();
  return items.filter((i) => {
    if (!i.source.youtube) return true;
    const n = perChannel.get(i.source.name) ?? 0;
    perChannel.set(i.source.name, n + 1);
    return n < MAX_VIDEOS_PER_CHANNEL;
  });
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
    const { data, error } = await supabase.from("articles").update({ image_url: item.image })
      .eq("source_url", item.link).or("image_url.is.null,image_url.eq.").select("id");
    if (error) console.warn(`  photo non ajoutée (${item.link}) : ${error.message}`);
    else added += data.length;
  }
  if (added) console.log(`${added} photos ajoutées à des infos déjà enregistrées`);
}

/** Photo d'aperçu de la page d'un article, sans faire échouer le passage si le site ne répond pas. */
async function tryPreview(link: string): Promise<string | null | undefined> {
  try {
    return await previewImage(link);
  } catch (e) {
    console.warn(`  aperçu indisponible (${link}) : ${(e as Error).message}`);
    return undefined; // on réessaiera au prochain passage
  }
}

/**
 * Infos enregistrées sans photo (médias qui n'en mettent pas dans leur flux) : on cherche la photo
 * d'aperçu de leur page, les plus récentes d'abord, quelques-unes par passage.
 */
async function addPreviewImages() {
  if (!supabase || DRY_RUN) return;
  const { data, error } = await supabase.from("articles").select("id, source_url")
    .is("image_url", null).in("status", ["draft", "published"])
    .order("published_at", { ascending: false }).limit(PREVIEWS_PER_RUN);
  if (error) return console.warn(`Infos sans photo indisponibles : ${error.message}`);
  let added = 0;
  for (let i = 0; i < data.length; i += 4) {
    await Promise.all(data.slice(i, i + 4).map(async (row) => {
      const image = await tryPreview(row.source_url);
      if (image === undefined) return;
      const { error } = await supabase.from("articles").update({ image_url: image ?? NO_PREVIEW }).eq("id", row.id).is("image_url", null);
      if (error) console.warn(`  photo d'aperçu non ajoutée (${row.source_url}) : ${error.message}`);
      else if (image) added++;
    }));
  }
  console.log(`${added} photos d'aperçu ajoutées sur ${data.length} infos sans photo examinées`);
}

// Les vidéos YouTube enregistrées sont remises à jour au moins chaque semaine (les règles de l'API imposent
// 30 jours au plus) : marge confortable si GitHub saute des passages.
const VIDEO_REFRESH_DAYS = 7;
const VIDEOS_PER_RUN = 200; // 4 appels à l'API, 4 unités

/**
 * Rafraîchit titre, extrait et miniature des vidéos YouTube enregistrées depuis plus d'une semaine,
 * et retire du site celles qui ont été supprimées ou rendues privées (status « rejected », texte effacé).
 */
async function refreshVideos() {
  if (!supabase || DRY_RUN || !process.env.YOUTUBE_API_KEY?.trim()) return;
  const before = new Date(Date.now() - VIDEO_REFRESH_DAYS * 86400_000).toISOString();
  const { data, error } = await supabase.from("articles").select("id, source_url, title")
    .like("source_url", "https://www.youtube.com/watch?v=%").in("status", ["draft", "published"])
    .lt("refreshed_at", before).order("refreshed_at").limit(VIDEOS_PER_RUN);
  if (error) return console.warn(`Vidéos à rafraîchir indisponibles : ${error.message}`);
  if (!data.length) return;
  let current;
  try {
    current = await currentVideos(data.map((r) => new URL(r.source_url).searchParams.get("v")!));
  } catch (e) {
    return console.warn(`Rafraîchissement des vidéos impossible : ${(e as Error).message}`);
  }
  const now = new Date().toISOString();
  let gone = 0;
  for (const row of data) {
    const video = current.get(new URL(row.source_url).searchParams.get("v")!);
    const update = video
      ? { title: video.title.trim().slice(0, 300), summary: excerpt(video.contentSnippet, video.title), image_url: imageOf(video) ?? null, refreshed_at: now }
      : { status: "rejected", title: "Vidéo retirée", summary: "", image_url: null, refreshed_at: now };
    if (!video) gone++;
    const { error } = await supabase.from("articles").update(update).eq("id", row.id);
    if (error) console.warn(`  vidéo non rafraîchie (${row.source_url}) : ${error.message}`);
  }
  console.log(`${data.length} vidéos YouTube rafraîchies, dont ${gone} retirées (supprimées ou privées)`);
}

/**
 * Complète ou allonge le résumé des infos déjà enregistrées encore présentes dans les flux : extrait vide
 * (flux qui le plaçait dans content:encoded) ou plus court que ce que donne la règle actuelle (résumés de
 * 280 caractères d'avant). Ajoute aussi le texte complet des médias qui l'ont autorisé.
 */
async function addMissingExcerpts(items: Item[]) {
  if (!supabase || DRY_RUN) return;
  let added = 0;
  for (let i = 0; i < items.length; i += 200) {
    const batch = items.slice(i, i + 200);
    const { data, error } = await supabase.from("articles").select("id,source_url,title,summary,body")
      .in("status", ["draft", "published"]).in("source_url", batch.map((item) => item.link));
    if (error) throw error;
    for (const row of data) {
      const item = batch.find((item) => item.link === row.source_url)!;
      const summary = excerpt(item.snippet, row.title);
      const update: { summary?: string; body?: string } = {};
      if (summary.length > (row.summary ?? "").length) update.summary = summary;
      if (item.full && !row.body) update.body = item.full;
      if (!Object.keys(update).length) continue;
      const { data: saved, error } = await supabase.from("articles").update(update).eq("id", row.id).select("id");
      if (error) throw error;
      added += saved.length;
    }
  }
  console.log(`${added} résumés complétés ou allongés`);
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
  await addMissingExcerpts(unique);
  await addPreviewImages();
  await refreshVideos();
  // Les plus récentes d'abord : si le plafond est atteint, ce sont les plus anciennes qui attendent.
  const fresh = capVideos(unique
    .filter((i) => !known.has(i.link))
    .sort((a, b) => b.date.localeCompare(a.date)))
    .slice(0, MAX_NEW_PER_RUN);
  console.log(`\n${all.length} entrées récentes, ${fresh.length} nouvelles à traiter${DRY_RUN ? " (dry-run)" : ""}\n`);
  const recent = await recentTitles();

  for (const item of fresh) {
    if (DRY_RUN) {
      console.log(`• [${item.source.sport}]${item.source.official ? " [officiel]" : ""} ${item.title} (${item.publisher})\n  ${item.link}`);
      if (item.image) console.log(`  photo : ${item.image}`);
      else {
        const preview = await tryPreview(item.link);
        console.log(preview ? `  photo d'aperçu : ${preview}` : "  pas de photo");
      }
      continue;
    }
    if (isRepeat(recent, item.title) || (item.source.mixed && !isCombatNews(item.title, item.snippet))) {
      const reason = isRepeat(recent, item.title) ? "doublon" : "hors-sujet";
      console.log(`  écarté (${reason}) : ${item.title}`);
      await markRejected(item, reason);
      continue;
    }
    // Pas de photo dans le flux : celle de l'aperçu de sa page. Site muet : null, on réessaiera plus tard.
    const preview = item.image ? undefined : await tryPreview(item.link);
    const image = item.image ?? (preview === undefined ? null : preview ?? NO_PREVIEW);
    const title = item.title.trim().slice(0, 300);
    const content = { title, summary: excerpt(item.snippet, title), body: item.full ?? "", sport: sportOf(title, item.source.sport), tags: [] };
    const row = {
      slug: `${slugify(content.title)}-${Date.now().toString(36)}`,
      ...content,
      image_url: image, // photo du média (flux ou aperçu de sa page), affichée depuis son serveur
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
