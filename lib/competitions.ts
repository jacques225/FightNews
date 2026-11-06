/**
 * Compétitions ouvertes aux combattants (opens, coupes, championnats, galas amateurs), lues sur des sources
 * qui autorisent la lecture automatique (robots.txt vérifiés le 2026-11-06) :
 * - Smoothcomp, la plateforme d'inscription des tournois de JJB, grappling, sambo, MMA amateur… (France) ;
 * - le calendrier officiel de la FFKarate (karaté, karaté contact, wushu, arts martiaux vietnamiens…) ;
 * - les événements de la FFKMDA (kickboxing, muay thaï, pancrace).
 * On ne reprend que les infos pratiques (nom, date, lieu) et on renvoie toujours vers la fiche d'origine.
 */

import { SPORTS, LIFESTYLE } from "./sports";

export type Competition = {
  id: string;
  title: string;
  start: string; // AAAA-MM-JJ
  end: string; // AAAA-MM-JJ (= start pour un événement d'un jour)
  city: string;
  disciplines: string[]; // libellés en français, ex. « JJB », « Muay thaï »
  sport: string; // filtre : une rubrique du site, ou « karate » (voir FILTERS)
  kind: string; // ex. « Open », « Coupe de France », « Gala »
  source: string; // nom de la source
  url: string; // fiche ou page d'inscription d'origine
};

export const SOURCES = [
  { name: "Smoothcomp", url: "https://smoothcomp.com/en/events/upcoming?countries=FR" },
  { name: "FFKarate", url: "https://www.ffkarate.fr/calendrier/" },
  { name: "FFKMDA", url: "https://www.ffkmda.com/evenements/" },
];

/** Fédérations dont le calendrier n'est pas lisible automatiquement : on donne seulement le lien. */
export const OTHER_CALENDARS = [
  { name: "FFBoxe (boxe anglaise)", url: "https://www.ffboxe.fr/" },
  { name: "FFJudo (judo, ju-jitsu)", url: "https://www.ffjudo.com/" },
  { name: "FFLutte (lutte, grappling, sambo)", url: "https://www.fflutte.com/" },
  { name: "CFJJB (jiu-jitsu brésilien)", url: "https://cfjjb.com/" },
  { name: "IBJJF (JJB international)", url: "https://ibjjf.com/events/calendar" },
  { name: "FFSavate (boxe française)", url: "https://www.ffsavate.com/" },
  { name: "FMMAF (MMA)", url: "https://www.fmmaf.fr/" },
];

/** Filtres de la page : les rubriques du site, plus le karaté et les arts martiaux associés (sans rubrique d'actu). */
export const FILTERS = [
  ...SPORTS.filter((s) => s.slug !== LIFESTYLE).map((s) => ({ slug: s.slug, short: s.short, color: s.color })),
  { slug: "karate", short: "Karaté", color: "#eab308" },
];

const USER_AGENT = "FightNewsBot/1.0 (+https://github.com/jacques225/FightNews)";
const REFRESH = 6 * 3600; // chaque source est relue au plus toutes les 6 h

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html" },
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: REFRESH },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} a répondu ${res.status}`);
  return res.text();
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&lsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Nom lisible : les titres tout en capitales (« CHAMPIONNATS D'EUROPE DE KICKBOXING ») passent en minuscules,
 * en gardant les sigles courts (WAKO, IFMA, JJB) et la majuscule initiale.
 */
export function tidyTitle(title: string): string {
  const letters = title.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  if (letters.length < 6 || upper / letters.length < 0.7) return title;
  const out = title.replace(/\p{L}+/gu, (w) => (w.length <= 4 && w === w.toUpperCase() && !/^(DE|DU|DES|LA|LE|LES|ET|EN|AU|AUX|UN|UNE|SUR|POUR|PAR|D|L)$/.test(w) ? w : w.toLowerCase()));
  const named = out.replace(/\b(europe|france|paris|asie|afrique|am[ée]rique|occitanie|bretagne|normandie)\b/giu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  return named.charAt(0).toUpperCase() + named.slice(1);
}

/** Type d'épreuve deviné d'après le nom. */
export function kindOf(title: string): string {
  const t = title.toLowerCase();
  if (/championnats? du monde|world championship/.test(t)) return "Championnat du monde";
  if (/championnats? d'europe|european/.test(t)) return "Championnat d'Europe";
  if (/championnats? de france/.test(t)) return "Championnat de France";
  if (/coupe de france/.test(t)) return "Coupe de France";
  if (/championnat|championship/.test(t)) return "Championnat";
  if (/coupe|cup/.test(t)) return "Coupe";
  if (/grand prix/.test(t)) return "Grand Prix";
  if (/open/.test(t)) return "Open";
  if (/tournoi|tournament|tour\b|league|series|ligue/.test(t)) return "Tournoi";
  if (/gala|fight night|night|nuit|show/.test(t)) return "Gala";
  return "Compétition";
}

// ── Smoothcomp ───────────────────────────────────────────────

// Disciplines Smoothcomp (identifiants de leurs « category groups ») → libellé français et rubrique du site.
const SMOOTHCOMP: Record<string, [string, string]> = {
  "1": ["JJB", "grappling"], "7": ["JJB no-gi", "grappling"], "4": ["ADCC", "grappling"], "3": ["Submission", "grappling"],
  "24": ["Luta livre", "grappling"], "25": ["Sumo", "lutte"], "5": ["Allstyle", "grappling"],
  "2": ["Ju-jitsu", "judo"], "17": ["Ju-jitsu", "judo"], "18": ["Ju-jitsu", "judo"], "23": ["Ju-jitsu ne-waza", "judo"],
  "20": ["Kudo", "mma"], "19": ["MMA", "mma"], "22": ["Sambo", "lutte"], "21": ["Shooto", "mma"],
  "52": ["Boxe", "boxe"], "26": ["Judo", "judo"], "8": ["Karaté", "karate"], "27": ["Karaté", "karate"], "28": ["Karaté", "karate"],
  "9": ["Taekwondo", "karate"], "29": ["Taekwondo", "karate"], "30": ["Taekwondo", "karate"], "31": ["Taekwondo", "karate"],
  "32": ["Lutte", "lutte"], "33": ["Lutte gréco", "lutte"], "34": ["Lutte libre", "lutte"], "35": ["Lutte", "lutte"],
  "37": ["Kickboxing", "kickboxing"], "50": ["Kyokushin", "karate"], "10": ["Muay thaï", "muay-thai"], "39": ["Savate", "boxe"],
  "40": ["Wushu", "karate"], "44": ["Sanda", "karate"], "41": ["Glima", "lutte"],
};

/** « la rochelle » ou « ANGLET » → « La Rochelle », « Anglet » ; une casse déjà mixte est gardée. */
export function cityCase(city: string): string {
  const c = city.trim();
  if (c !== c.toLowerCase() && c !== c.toUpperCase()) return c;
  return c.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

type SmoothcompEvent = {
  id: number; title: string; url: string; startdate: string; enddate: string;
  location_city?: string; location_country?: string; categoryGroups?: string[]; eventEnded?: boolean;
};

/** Lit la liste `var events = [...]` de la page Smoothcomp des prochains événements. */
export function parseSmoothcomp(html: string): Competition[] {
  const i = html.indexOf("var events = [");
  if (i < 0) throw new Error("Smoothcomp : liste des événements introuvable");
  const start = i + "var events = ".length;
  // La liste est du JSON : on cherche le crochet fermant correspondant, en sautant les chaînes.
  let depth = 0, inStr = false, end = -1;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (c === "\\") k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  const events = JSON.parse(html.slice(start, end)) as SmoothcompEvent[];
  return events
    .filter((e) => !e.eventEnded && (!e.location_country || e.location_country === "FR"))
    .map((e) => {
      const groups = (e.categoryGroups ?? []).map((g) => SMOOTHCOMP[g]).filter(Boolean);
      const disciplines = [...new Set(groups.map((g) => g[0]))];
      return {
        id: `smoothcomp-${e.id}`,
        title: tidyTitle(decode(e.title)),
        start: e.startdate.slice(0, 10),
        end: (e.enddate || e.startdate).slice(0, 10),
        city: cityCase(e.location_city ?? ""),
        disciplines: disciplines.length ? disciplines : ["Grappling"],
        sport: groups[0]?.[1] ?? "grappling",
        kind: kindOf(e.title),
        source: "Smoothcomp",
        url: e.url,
      };
    });
}

// ── FFKarate ─────────────────────────────────────────────────

type WpCalendrier = {
  id: number; link: string; title: { rendered: string };
  acf?: { date_debut?: string; date_fin?: string; event_form_link?: string };
  class_list?: string[]; "event-location"?: number[];
};

// Catégories FFKarate → libellé français ; filtre « karate » (karaté et arts martiaux associés).
const FFKARATE: Record<string, string> = {
  karate: "Karaté", "karate-mix": "Karaté mix", contact: "Karaté contact", wushu: "Wushu", amv: "Arts martiaux vietnamiens",
  "nihon-tai-jitsu": "Nihon tai jitsu", "tai-jitsu": "Tai jitsu", yoseikan: "Yoseikan budo", amsea: "Arts martiaux du Sud-Est asiatique",
  "kali-eskrima": "Kali eskrima", aito: "Aïto", "body-karate": "Body karaté", "shorinji-kempo": "Shorinji kempo",
};

// On ne garde que les épreuves : pas les stages, passages de grade, formations ni séminaires.
const IS_CONTEST = /coupe|championnat|open|grand prix|tournoi|crit[ée]rium|troph[ée]e|interclubs?|challenge|ligue/i;
const NOT_CONTEST = /stage|passage de grade|grades?\b|formation|s[ée]minaire|examen|vae|entretien|journ[ée]e nationale|colloque|assembl[ée]e/i;

export function parseFFKarate(posts: WpCalendrier[], places: Map<number, string>, today: string): Competition[] {
  const out: Competition[] = [];
  for (const p of posts) {
    const title = tidyTitle(decode(p.title.rendered));
    const start = p.acf?.date_debut?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !IS_CONTEST.test(title) || NOT_CONTEST.test(title)) continue;
    const end = p.acf?.date_fin?.slice(0, 10) || start;
    if (end < today) continue;
    const cats = (p.class_list ?? []).filter((c) => c.startsWith("category-")).map((c) => c.slice(9));
    const disciplines = [...new Set(cats.map((c) => FFKARATE[c]).filter(Boolean))];
    const place = (p["event-location"] ?? []).map((id) => places.get(id)).find(Boolean) ?? "";
    out.push({
      id: `ffkarate-${p.id}`,
      title,
      start,
      end: end < start ? start : end,
      city: place,
      disciplines: disciplines.length ? disciplines : ["Karaté"],
      sport: "karate",
      kind: kindOf(title),
      source: "FFKarate",
      url: p.link,
    });
  }
  return out;
}

/**
 * Ville d'un lieu FFKarate : « Palais des sports - Béziers (34) » donne « Béziers (34) ».
 * Les lieux « -- En attente de confirmation de la salle -- » sont vides.
 */
export function placeName(name: string): string {
  const n = decode(name);
  if (n.startsWith("--")) return "";
  const city = n.split(" - ").pop()!.trim();
  // « VILLEBON-SUR-YVETTE (91) » → « Villebon-Sur-Yvette (91) »
  return cityCase(city);
}

// ── FFKMDA ───────────────────────────────────────────────────

type WpEvent = { id: number; link: string; title: { rendered: string }; content: { rendered: string }; class_list?: string[] };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const FFKMDA_DISCIPLINE: Record<string, [string, string]> = {
  kickboxing: ["Kickboxing", "kickboxing"], muaythai: ["Muay thaï", "muay-thai"], pancrace: ["Pancrace", "mma"],
};
const FFKMDA_KIND: Record<string, string> = {
  galas: "Gala", "competitions-amateurs": "Compétition amateur", "competitions-professionnelles": "Compétition pro",
  "calendrier-international": "International",
};

/** Première date écrite en toutes lettres dans le texte (« samedi 7 novembre 2026 », « le 1er mars 2027 »). */
export function frenchDate(text: string): string {
  const m = text.toLowerCase().match(new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MONTHS.join("|")}|fevrier|aout|decembre)\\s+(20\\d{2})`));
  if (!m) return "";
  const month = MONTHS.findIndex((x) => x.normalize("NFD").replace(/\p{M}/gu, "") === m[2].normalize("NFD").replace(/\p{M}/gu, "")) + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Ville : le code postal suivi du nom (« 80700 Roye »). */
export function postcodeCity(text: string): string {
  const m = text.match(/\b(?:\d{5}|97\d{3})\s+([A-ZÀ-Ý][\p{L}' -]{1,40}?)(?=[,)\n.]|\s+France|\s*$)/u);
  return m ? m[1].trim() : "";
}

export function parseFFKMDA(posts: WpEvent[], today: string): Competition[] {
  const out: Competition[] = [];
  for (const p of posts) {
    const text = decode(p.content.rendered);
    const title = tidyTitle(decode(p.title.rendered));
    const start = frenchDate(text);
    if (!start || start < today) continue;
    const classes = p.class_list ?? [];
    const disc = classes.filter((c) => c.startsWith("event_discipline-")).map((c) => FFKMDA_DISCIPLINE[c.slice(17)]).filter(Boolean);
    const cat = classes.find((c) => c.startsWith("event_category-"))?.slice(15) ?? "";
    out.push({
      id: `ffkmda-${p.id}`,
      title,
      start,
      end: start,
      city: postcodeCity(text),
      disciplines: disc.length ? [...new Set(disc.map((d) => d[0]))] : ["Pieds-poings"],
      sport: disc[0]?.[1] ?? "kickboxing",
      kind: FFKMDA_KIND[cat] ?? kindOf(title),
      source: "FFKMDA",
      url: p.link,
    });
  }
  return out;
}

// ── Assemblage ───────────────────────────────────────────────

const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

async function fromSmoothcomp(): Promise<Competition[]> {
  return parseSmoothcomp(await get(SOURCES[0].url));
}

async function fromFFKarate(today: string): Promise<Competition[]> {
  const fields = "id,link,title,acf.date_debut,acf.date_fin,class_list,event-location";
  const pages = await Promise.all(
    [1, 2].map((n) => get(`https://www.ffkarate.fr/wp-json/wp/v2/calendrier?per_page=100&page=${n}&_fields=${fields}`).catch(() => "[]")),
  );
  const posts = pages.flatMap((p) => JSON.parse(p) as WpCalendrier[]);
  const ids = [...new Set(posts.flatMap((p) => p["event-location"] ?? []))];
  const places = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const terms = JSON.parse(
      await get(`https://www.ffkarate.fr/wp-json/wp/v2/event-location?per_page=100&include=${chunk.join(",")}&_fields=id,name`).catch(() => "[]"),
    ) as { id: number; name: string }[];
    for (const t of terms) places.set(t.id, placeName(t.name));
  }
  return parseFFKarate(posts, places, today);
}

async function fromFFKMDA(today: string): Promise<Competition[]> {
  const posts = JSON.parse(
    await get("https://www.ffkmda.com/wp-json/wp/v2/events?per_page=100&_fields=id,link,title,content,class_list"),
  ) as WpEvent[];
  return parseFFKMDA(posts, today);
}

export type CompetitionsResult = { competitions: Competition[]; failed: string[] };

/** Toutes les compétitions à venir, par date. Une source en panne n'empêche pas d'afficher les autres. */
export async function getCompetitions(): Promise<CompetitionsResult> {
  const today = parisToday();
  const jobs: [string, Promise<Competition[]>][] = [
    ["Smoothcomp", fromSmoothcomp()],
    ["FFKarate", fromFFKarate(today)],
    ["FFKMDA", fromFFKMDA(today)],
  ];
  const results = await Promise.allSettled(jobs.map((j) => j[1]));
  const failed: string[] = [];
  const all: Competition[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else { failed.push(jobs[i][0]); console.error(`Compétitions ${jobs[i][0]} :`, r.reason); }
  });
  const competitions = all
    .filter((c) => c.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "fr"));
  return { competitions, failed };
}
