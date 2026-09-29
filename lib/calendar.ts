import { parseAnnounced, parseCard, parseEventList, sameTitle, splitSections, withSubsections, type Bout, type Section, type Segment } from "./wikitext";

/**
 * Calendrier des combats, lu sur Wikipédia (en anglais) : la liste des prochains événements de chaque
 * organisation, puis la carte de chacun sur sa page ou dans sa section. Wikipédia autorise cette
 * reprise (licence CC BY-SA 4.0) à condition de la citer : la page Calendrier le fait.
 */

export type FightEvent = {
  id: string;
  org: string;
  sport: string; // rubrique du site, pour la couleur
  name: string;
  date: string; // AAAA-MM-JJ, date locale de l'événement (Wikipédia ne donne pas l'heure)
  venue: string;
  location: string;
  card: Segment[];
  url: string; // page ou section Wikipédia de l'événement
};

type Source = { org: string; sport: string; page: (year: number) => string; yearly: boolean; list: RegExp };

// Pour chaque organisation : la page qui liste ses événements, et la section qui contient le tableau.
const SOURCES: Source[] = [
  { org: "UFC", sport: "mma", page: () => "List of UFC events", yearly: false, list: /^scheduled events$/i },
  { org: "PFL", sport: "mma", page: () => "List of Professional Fighters League events", yearly: false, list: /^scheduled events$/i },
  { org: "ONE", sport: "mma", page: (y) => `${y} in ONE Championship`, yearly: true, list: /^scheduled events$/i },
  { org: "KSW", sport: "mma", page: (y) => `${y} in Konfrontacja Sztuk Walki`, yearly: true, list: /^(list of events|events list)$/i },
  { org: "Oktagon", sport: "mma", page: (y) => `${y} in Oktagon MMA`, yearly: true, list: /^(list of events|events list)$/i },
  { org: "Cage Warriors", sport: "mma", page: (y) => `${y} in Cage Warriors`, yearly: true, list: /^(list of events|events list)$/i },
  { org: "Rizin", sport: "mma", page: (y) => `${y} in Rizin Fighting Federation`, yearly: true, list: /^(list of events|events list)$/i },
  { org: "Brave CF", sport: "mma", page: (y) => `${y} in Brave Combat Federation`, yearly: true, list: /^(list of events|events list)$/i },
  { org: "Glory", sport: "kickboxing", page: (y) => `${y} in Glory`, yearly: true, list: /^(list of events|events list)$/i },
];

export const ORGS = SOURCES.map((s) => s.org);

const API = "https://en.wikipedia.org/w/api.php";
// Wikipédia demande aux robots de s'identifier, avec un moyen de contact.
const USER_AGENT = "FightNewsBot/1.0 (+https://github.com/jacques225/FightNews)";
const REFRESH = 6 * 3600; // chaque page Wikipédia est relue au plus toutes les 6 h

// Nom du segment des combats annoncés sans place sur la carte (ordre sans signification).
export const ANNOUNCED = "Combats annoncés";

type Page = { title: string; text: string };

/** Pages Wikipédia (50 au plus), rangées par titre demandé ; une page qui n'existe pas est omise. */
async function wikiPages(titles: string[]): Promise<Map<string, Page>> {
  const out = new Map<string, Page>();
  if (!titles.length) return out;
  const params = new URLSearchParams({
    action: "query", prop: "revisions", rvprop: "content", rvslots: "main",
    titles: titles.join("|"), redirects: "1", format: "json", formatversion: "2",
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    // Wikipédia injoignable : on abandonne vite pour ne pas bloquer la page (ni le déploiement).
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: REFRESH },
  });
  if (!res.ok) throw new Error(`Wikipédia a répondu ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages?: { title: string; missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }[];
    };
  };
  const alias = new Map<string, string>();
  for (const a of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) alias.set(a.from, a.to);
  const byTitle = new Map<string, Page>();
  for (const p of json.query?.pages ?? []) {
    const text = p.revisions?.[0]?.slots?.main?.content;
    if (!p.missing && typeof text === "string") byTitle.set(p.title, { title: p.title, text });
  }
  for (const t of titles) {
    let final = t;
    for (let i = 0; i < 3 && alias.has(final); i++) final = alias.get(final)!;
    const page = byTitle.get(final);
    if (page) out.set(t, page);
  }
  return out;
}

/** Adresse d'une page Wikipédia, écrite comme Wikipédia l'écrit : « UFC_Fight_Night:_Moicano_vs._Nolan ». */
export function wikiUrl(title: string, anchor?: string) {
  const part = (s: string) => encodeURI(s.trim().replace(/ /g, "_")).replace(/[?#]/g, encodeURIComponent);
  return `https://en.wikipedia.org/wiki/${part(title)}${anchor ? `#${part(anchor)}` : ""}`;
}

/** La carte d'une page d'événement : section « Fight card », plus les combats annoncés pas encore placés. */
function cardFromSections(sections: Section[]): Segment[] {
  const card = sections.filter((s) => /^(fight card|results)$/i.test(s.title)).flatMap((s) => parseCard(s.text));
  // Page annuelle sans sous-section dédiée : la carte est directement dans la section de l'événement.
  if (!card.length && sections.length === 1) card.push(...parseCard(sections[0].text));
  const announced = sections.filter((s) => /^announced bouts$/i.test(s.title)).flatMap((s) => parseAnnounced(s.text));
  if (announced.length) card.push({ name: ANNOUNCED, bouts: announced });
  return card;
}

/** Un événement reste affiché jusqu'au lendemain matin (heure de Paris) : les galas américains finissent tard. */
export const isUpcoming = (date: string, now: Date) => Date.parse(`${date}T00:00:00Z`) + 30 * 3600_000 > now.getTime();

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function fromSource(src: Source, title: string, now: Date): Promise<FightEvent[]> {
  const page = (await wikiPages([title])).get(title);
  if (!page) return []; // page annuelle pas encore créée
  const sections = splitSections(page.text);
  const list = sections.find((s) => src.list.test(s.title));
  if (!list) throw new Error("tableau des événements introuvable");
  const listed = parseEventList(list.text).filter((e) => isUpcoming(e.date, now));

  const linked = [...new Set(listed.flatMap((e) => (e.page && !sameTitle(e.page, page.title) ? [e.page] : [])))];
  const eventPages = await wikiPages(linked.slice(0, 50));

  return listed.map((e) => {
    let card: Segment[] = [];
    let url = wikiUrl(page.title);
    const own = e.page ? eventPages.get(e.page) : undefined;
    if (own) {
      card = cardFromSections(splitSections(own.text));
      url = wikiUrl(own.title, e.anchor);
    } else {
      // Événement décrit dans une section de la page annuelle (lien d'ancre, ou simple nom sans lien).
      const i = sections.findIndex((s) => s.level === 2 && (sameTitle(s.title, e.anchor ?? "") || sameTitle(s.title, e.name)));
      if (i >= 0) {
        card = cardFromSections(withSubsections(sections, i));
        url = wikiUrl(page.title, sections[i].title);
      }
    }
    const { name, date, venue, location } = e;
    return { id: slugify(`${name} ${date}`), org: src.org, sport: src.sport, name, date, venue, location, card, url };
  });
}

/**
 * Les prochains événements de toutes les organisations, du plus proche au plus lointain, et les pages
 * illisibles (page modifiée, Wikipédia injoignable) : elles sont ignorées sans bloquer les autres.
 */
export async function loadCalendar(now = new Date()): Promise<{ events: FightEvent[]; errors: string[] }> {
  const year = now.getUTCFullYear();
  // À partir d'octobre, la page de l'année suivante peut déjà annoncer les galas de janvier.
  const years = now.getUTCMonth() >= 9 ? [year, year + 1] : [year];
  const jobs = SOURCES.flatMap((src) => (src.yearly ? years.map(src.page) : [src.page(year)]).map((title) => ({ src, title })));
  const results = await Promise.allSettled(jobs.map(({ src, title }) => fromSource(src, title, now)));

  const events = new Map<string, FightEvent>();
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") for (const e of r.value) events.set(e.id, e);
    else errors.push(`${jobs[i].title} : ${(r.reason as Error)?.message ?? r.reason}`);
  });
  const sorted = [...events.values()].sort((a, b) => a.date.localeCompare(b.date) || ORGS.indexOf(a.org) - ORGS.indexOf(b.org));
  return { events: sorted, errors };
}

export async function getUpcomingEvents(now = new Date()): Promise<FightEvent[]> {
  const { events, errors } = await loadCalendar(now);
  for (const e of errors) console.warn(`Calendrier : ${e}`);
  return events;
}

/** Tête d'affiche : le premier combat de la carte ; parmi les seuls combats annoncés, le premier combat pour un titre. */
export function mainBout(e: FightEvent): Bout | undefined {
  const [first] = e.card;
  if (!first) return undefined;
  return first.name === ANNOUNCED ? (first.bouts.find((b) => b.title) ?? first.bouts[0]) : first.bouts[0];
}

/** « UFC 332: Silva vs. Wang » → « UFC 332 », quand l'affiche est écrite à côté. */
export const shortName = (name: string) => name.replace(/:\s*[^:]*\bvs\b.*$/i, "").trim() || name;

// ── Libellés en français ──────────────────────────────────────

const CLASSES: [RegExp, string][] = [
  [/light heavyweight/i, "Poids mi-lourds"],
  [/super heavyweight/i, "Poids super-lourds"],
  [/cruiserweight/i, "Poids lourds-légers"],
  [/heavyweight/i, "Poids lourds"],
  [/super middleweight/i, "Poids super-moyens"],
  [/super welterweight|light middleweight/i, "Poids super-mi-moyens"],
  [/middleweight/i, "Poids moyens"],
  [/super lightweight|light welterweight/i, "Poids super-légers"],
  [/welterweight/i, "Poids mi-moyens"],
  [/lightweight/i, "Poids légers"],
  [/super featherweight/i, "Poids super-plumes"],
  [/featherweight/i, "Poids plumes"],
  [/super bantamweight/i, "Poids super-coqs"],
  [/bantamweight/i, "Poids coqs"],
  [/super flyweight/i, "Poids super-mouches"],
  [/flyweight/i, "Poids mouches"],
  [/strawweight/i, "Poids pailles"],
  [/atomweight/i, "Poids atomes"],
  [/catchweight/i, "Poids intermédiaire"],
  [/openweight/i, "Toutes catégories"],
];

const DISCIPLINES: [RegExp, string][] = [
  [/muay thai/i, "Muay thaï"],
  [/kickboxing/i, "Kickboxing"],
  [/grappling/i, "Grappling"],
  [/\bmma\b/i, "MMA"],
];

/** « Women's Flyweight » → « Poids mouches féminin » ; « Lightweight 70 kg » → « Poids légers, 70 kg » ;
 * « Atomweight Muay Thai » (ONE) → « Muay thaï · Poids atomes ». */
export function weightFr(raw: string): string {
  const cls = CLASSES.find(([re]) => re.test(raw));
  if (!cls) return raw;
  const discipline = DISCIPLINES.find(([re]) => re.test(raw))?.[1];
  const limit = /[+-]?\d+(?:[.,]\d+)?\s*(?:kg|lb)/i.exec(raw)?.[0];
  const label = [cls[1] + (/women/i.test(raw) ? " féminin" : ""), limit].filter(Boolean).join(", ");
  return discipline ? `${discipline} · ${label}` : label;
}

/** « Main card (Paramount+ / CBS) » → « Carte principale · Paramount+ / CBS ». */
export function segmentFr(raw: string): string {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(raw);
  const base = (m ? m[1] : raw).trim();
  const fr = /early prelim/i.test(base)
    ? "Préliminaires d'ouverture"
    : /prelim|lead card|undercard/i.test(base)
      ? "Préliminaires"
      : /main card/i.test(base)
        ? "Carte principale"
        : base;
  return m ? `${fr} · ${m[2]}` : fr;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

/** Morceaux d'une date d'événement pour l'affichage : « sam. », « 3 », « oct. », et « samedi 3 octobre 2026 ». */
export function dateParts(date: string) {
  const parts = dayFmt.formatToParts(noon(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month"), long: longFmt.format(noon(date)) };
}

/** « octobre 2026 » → « Octobre 2026 ». */
export function monthLabel(date: string) {
  const s = monthFmt.format(noon(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
