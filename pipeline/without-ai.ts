import { SPORTS } from "../lib/sports";
import { escapeRe } from "./feeds";

// Mode RSS français : le robot reprend le titre de la source
// et un court extrait, avec le lien vers l'article complet. Rien n'est réécrit ni traduit.

export const MAX_EXCERPT = 280; // un extrait, pas l'article : l'article complet reste chez son média

// Mentions ajoutées en fin de résumé par les blogs (WordPress surtout) : elles n'ont rien à faire dans l'extrait.
const TRAILERS = [
  /\s*The post .+ appeared first on .+$/i,
  /\s*(L['’]|Cet )article .+ est apparu en premier sur .+$/i,
  /\s*(Continue reading|Read more|Lire la suite|Lire l['’]article)\b.*$/i,
  /\s*(\[(…|\.\.\.)\]|\((…|\.\.\.)\))\s*$/,
];

/** Court extrait du résumé de la source, coupé à la fin d'une phrase ou, à défaut, d'un mot. */
export function excerpt(snippet: string, title: string): string {
  let text = snippet.replace(/\s+/g, " ").trim();
  for (const re of TRAILERS) text = text.replace(re, "");
  if (title) {
    // Certains flux répètent le titre en tête du résumé, ou le mettent en lien à la fin (« Titre @ Boxing News 24 »).
    if (text.toLowerCase().startsWith(title.toLowerCase())) text = text.slice(title.length).replace(/^[\s:.–—-]+/, "");
    text = text.replace(new RegExp(`\\s*${escapeRe(title)}\\s*@[^@]*$`, "i"), "");
  }
  text = text.trim();
  // Résumé déjà coupé par la source au milieu d'une phrase : on le signale.
  if (text.length <= MAX_EXCERPT) return !text || /[.!?…"»”)]$/.test(text) ? text : text + "…";
  const cut = text.slice(0, MAX_EXCERPT);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > MAX_EXCERPT / 2) return cut.slice(0, end + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:–—-]+$/, "") + "…";
}

// Les médias qui couvrent plusieurs sports annoncent souvent le sport en tête du titre : « Boxe : … », « UFC: … ».
const PREFIXES: [string, string][] = [
  ["mma", "mma|ufc|pfl|bellator|ares|cage warriors"],
  ["boxe", "boxe|boxing"],
  ["kickboxing", "kick-?boxing|glory|k-?1"],
  ["muay-thai", "muay[ -]?tha[iï]"],
  ["judo", "judo"],
  ["grappling", "jjb|jiu-?jitsu|bjj|grappling|adcc"],
  ["lutte", "lutte|wrestling"],
];

/** Rubrique d'une info : celle de son flux, sauf si son titre commence par le nom d'un autre sport. */
export function sportOf(title: string, feedSport: string): string {
  const prefix = /^([^:]{2,25}?)\s?:\s/.exec(title)?.[1].trim();
  // Le mot doit être entier : « Boxe » oui, « Boxers » non (\b ne gère pas les lettres accentuées comme « thaï »).
  const match = prefix && PREFIXES.find(([, words]) => new RegExp(`^(${words})(?![\\p{L}\\p{N}])`, "iu").test(prefix))?.[0];
  if (match && SPORTS.some((s) => s.slug === match)) return match;
  // Les flux FFKMDA/RMC couvrent plusieurs disciplines : les noms explicites du titre priment.
  const named = PREFIXES.find(([, words]) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(${words})(?![\\p{L}\\p{N}])`, "iu").test(title))?.[0];
  return named ?? feedSport;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Même titre qu'une info déjà enregistrée ces dernières 48 h, dans n'importe quelle rubrique. */
export function isRepeat(bySport: Map<string, string[]>, title: string): boolean {
  const t = norm(title);
  return [...bySport.values()].some((titles) => titles.some((x) => norm(x) === t));
}

/** Les flux multisports ne doivent pas importer les sujets football, basket, etc. */
export function isCombatNews(title: string, snippet: string): boolean {
  return /\b(mma|ufc|pfl|bellator|ares|boxe|boxing|kickboxing|muay|judo|grappling|jjb|bjj|adcc|lutte|jiu[ -]?jitsu|octogone)\b/i.test(`${title} ${snippet}`);
}
