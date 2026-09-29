import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import Parser from "rss-parser";
import sources from "./sources.json";

// Lecture des flux RSS, partagée par le robot (run.ts) et le vérificateur (check-sources.ts).

export type Source = {
  name: string;
  url: string;
  sport: string;       // rubrique du flux
  language: "fr";     // seules les sources francophones sont actives
  mixed?: boolean;     // média multisport : filtrage des sujets sans rapport
  official?: boolean;  // site officiel (fédération, organisation) : badge "Officiel" sur le site
};

export const SOURCES = (sources as Source[]).filter((s) => s.language === "fr");

export const MAX_NEW_PER_RUN = 25; // plafond par passage du robot, pour limiter le volume de chaque import

/** Lit les flux 6 par 6 : un site lent ne bloque pas les autres. */
export async function eachSource<R>(fn: (s: Source) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < SOURCES.length; i += 6) out.push(...(await Promise.all(SOURCES.slice(i, i + 6).map(fn))));
  return out;
}

type SourceEl = string | { _?: string; $?: { url?: string } };
type MediaEl = { $?: { url?: string; medium?: string; type?: string; width?: string } };

/** Champs d'une info que rss-parser ne lit pas de lui-même. */
export type ItemExtras = {
  "content:encodedSnippet"?: string;
  sourceEl?: SourceEl;
  mediaContent?: MediaEl[];
  mediaThumbnail?: MediaEl[];
  mediaGroup?: { "media:content"?: MediaEl[]; "media:thumbnail"?: MediaEl[] }[];
  "content:encoded"?: string;
};

export const USER_AGENT = "Mozilla/5.0 (compatible; FightNewsBot/1.0; +https://github.com/jacques225/FightNews)";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
};

// Un lecteur neuf à chaque flux : après une erreur, celui de rss-parser peut rester dans un état incohérent.
const parse = (xml: string) =>
  new Parser<Record<string, never>, ItemExtras>({
    customFields: {
      item: [
        ["source", "sourceEl"],
        ["media:content", "mediaContent", { keepArray: true }],
        ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
        ["media:group", "mediaGroup", { keepArray: true }],
      ],
    },
  }).parseString(xml);

/** Site momentanément indisponible (pas de réponse à temps, erreur de son serveur) : souvent passager. */
export class UnavailableError extends Error {}

/**
 * Télécharge une adresse (flux ou robots.txt), en suivant jusqu'à 5 redirections.
 * Au bout de 20 s, la connexion est vraiment coupée : avec le téléchargement de rss-parser,
 * un site lent restait connecté et la tâche GitHub ne s'arrêtait plus.
 */
export function download(url: string, redirects = 0): Promise<{ status: number; body: Buffer; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https:") ? httpsGet : httpGet;
    const req = get(url, { headers: HEADERS, agent: false }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects < 5) {
        res.resume();
        clearTimeout(deadline);
        return resolve(download(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        clearTimeout(deadline);
        resolve({ status, body: Buffer.concat(chunks), contentType: res.headers["content-type"] });
      });
      res.on("error", (e) => {
        clearTimeout(deadline);
        reject(e);
      });
    });
    const deadline = setTimeout(() => req.destroy(new UnavailableError("pas de réponse en 20 s")), 20_000);
    req.on("error", (e) => {
      clearTimeout(deadline);
      reject(e);
    });
  });
}

/** Télécharge et lit un flux RSS ou Atom. */
export async function readFeed(url: string) {
  const res = await download(url);
  if (res.status >= 500) throw new UnavailableError(`erreur ${res.status} du serveur du site`);
  if (res.status >= 300) throw new Error(`Status code ${res.status}`);
  const xml = decode(res.body, res.contentType).replace(/^\uFEFF/, "");
  // Certains sites renvoient une page web (souvent une protection anti-robots) à la place du flux.
  if (/^\s*(<!doctype html|<html)/i.test(xml)) throw new Error("page web au lieu d'un flux RSS");
  try {
    return await parse(xml);
  } catch {
    // Flux mal formé : on le répare et on réessaie. Si ça ne suffit pas, le message montre l'endroit fautif.
    const repaired = repairXml(xml);
    try {
      return await parse(repaired);
    } catch (e) {
      throw xmlError(e as Error, repaired);
    }
  }
}

// Deux défauts courants font refuser tout le flux au lecteur XML :
// - un bloc <![CDATA[…]]> glissé dans un contenu déjà en CDATA : son ]]> coupe le contenu en deux (flux de l'IMMAF).
//   Le vrai bloc d'un élément se termine au ]]> suivi de la balise fermante de cet élément : les marques
//   CDATA trouvées avant sont retirées, le texte reste ;
// - du HTML brut hors CDATA (<br>, <img> sans fin de balise) : on ferme ces balises.
function repairXml(xml: string) {
  return xml
    .replace(/(<([\w:.-]+)[^>]*>\s*<!\[CDATA\[)([\s\S]*?)(\]\]>\s*<\/\2>)/g, (_, start: string, _tag: string, body: string, end: string) => {
      // "]]]]><![CDATA[>" est la bonne façon d'écrire "]]>" dans un bloc CDATA : on la garde.
      const text = body.replace(/\]\]\]\]><!\[CDATA\[>|<!\[CDATA\[|\]\]>/g, (m) => (m === "]]>" || m === "<![CDATA[" ? "" : "]]>"));
      return start + text.replace(/\]\]>/g, "]]]]><![CDATA[>") + end;
    })
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/<(br|hr|img|input|wbr|col|area|embed|meta)\b([^>]*?)\s*\/?>/gi, "<$1$2/>")))
    .join("");
}

// "Unexpected close tag\nLine: 57\nColumn: 80…" devient un message qui montre l'endroit fautif du flux.
function xmlError(e: Error, xml: string) {
  const line = /Line: (\d+)/.exec(e.message)?.[1];
  const column = Number(/Column: (\d+)/.exec(e.message)?.[1] ?? 0);
  if (!line) return e;
  const text = xml.split(/\r?\n/)[Number(line)] ?? "";
  const excerpt = text.slice(Math.max(0, column - 50), column + 10).trim();
  return new Error(`XML mal formé ligne ${Number(line) + 1} (${e.message.split("\n")[0]}) : « ${excerpt} »`);
}

// La plupart des flux sont en UTF-8, quelques-uns en ISO-8859-1 : on lit l'encodage annoncé.
function decode(buf: Buffer, contentType: string | undefined) {
  const head = new TextDecoder("latin1").decode(buf.subarray(0, 200));
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ?? /encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// Les flux d'agrégateurs indiquent le vrai média dans <source> et à la fin du titre ("Titre - L'Équipe").
// On cite ce média plutôt que l'agrégateur.
export function publisherOf(el: SourceEl | undefined, title: string, fallback: string) {
  const name = typeof el === "string" ? el : el?._;
  if (name?.trim()) return { publisher: name.trim(), title: title.replace(new RegExp(`\\s+-\\s+${escapeRe(name.trim())}$`), "") };
  return { publisher: fallback, title };
}
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Résumé en texte d'une info. Certains flux (MMA Fighting, Bad Left Hook) ouvrent leur contenu sur une photo
 * et sa légende (« LAS VEGAS, NEVADA - SEPTEMBER 26: … ») : on retire la photo pour garder le début de l'article.
 */
export function snippetOf(content: string | undefined, contentSnippet: string | undefined, encoded?: string, encodedSnippet?: string): string {
  // WordPress peut fournir le texte uniquement dans content:encoded (ex. ActuMMA).
  if (!content?.trim()) content = encoded;
  if (!contentSnippet?.trim()) contentSnippet = encodedSnippet;
  if (!content || !/<figure\b/i.test(content)) return contentSnippet ?? "";
  const text = content.replace(/<(figure|script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", laquo: "«", raquo: "»",
};

function decodeEntities(s: string) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
// Images qui ne sont pas la photo de l'article : pixels de mesure d'audience, avatars, émojis.
const NOT_A_PHOTO = /feedburner\.com|stats\.wordpress\.com|doubleclick\.net|gravatar\.com|\/emoji\/|[/_-]pixel\b/i;

/**
 * Photo d'une info, telle que son média la fournit dans son flux : balise media (la plus grande taille
 * raisonnable), pièce jointe, sinon première vraie image du contenu. Le site l'affiche depuis le serveur
 * du média, avec son nom en crédit.
 */
export function imageOf(it: ItemExtras & { enclosure?: { url?: string; type?: string }; content?: string }): string | undefined {
  const groups = it.mediaGroup ?? [];
  const media = [...(it.mediaContent ?? []), ...groups.flatMap((g) => g["media:content"] ?? [])]
    .map((m) => m.$ ?? {})
    .filter((m) => m.url && (m.medium === "image" || m.type?.startsWith("image/") || (!m.medium && !m.type && IMAGE_EXT.test(m.url))));
  // Plusieurs tailles proposées : la plus grande jusqu'à 1600 px, nette en une sans être trop lourde.
  const sized = media.filter((m) => Number(m.width) > 0 && Number(m.width) <= 1600).sort((a, b) => Number(b.width) - Number(a.width));
  const thumbs = [...(it.mediaThumbnail ?? []), ...groups.flatMap((g) => g["media:thumbnail"] ?? [])].map((m) => m.$?.url);
  const { url: enclosure, type } = it.enclosure ?? {};
  const candidates = [
    sized[0]?.url,
    ...media.map((m) => m.url),
    ...thumbs,
    enclosure && (type?.startsWith("image/") || IMAGE_EXT.test(enclosure)) ? enclosure : undefined,
    firstImage(it["content:encoded"]),
    firstImage(it.content),
  ];
  for (const c of candidates) {
    const url = photoUrl(c);
    if (url) return url;
  }
}

/** Première image du contenu HTML qui ressemble à une photo (pas un pixel de mesure ni une icône). */
function firstImage(html: string | undefined): string | undefined {
  for (const [tag] of html?.matchAll(/<img\b[^>]*>/gi) ?? []) {
    // Les sites qui chargent leurs images au défilement mettent la vraie adresse dans data-src.
    const src = photoUrl(attr(tag, "data-lazy-src") ?? attr(tag, "data-src") ?? attr(tag, "src"));
    const width = Number(attr(tag, "width"));
    if (src && !(width > 0 && width < 200)) return src;
  }
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];

/** Adresse https de la photo, ou rien si elle n'est pas exploitable. */
function photoUrl(raw: string | undefined): string | undefined {
  if (!raw) return;
  // Le site est en https : une image en http serait bloquée par le navigateur.
  const url = decodeEntities(raw.trim()).replace(/^\/\//, "https://").replace(/^http:\/\//i, "https://");
  if (/^https:\/\/[^\s"'<>]+$/.test(url) && url.length <= 1000 && !NOT_A_PHOTO.test(url)) return url;
}

/** Date ISO fiable : jamais dans le futur, maintenant si la date du flux est illisible. */
export function itemDate(raw: string | undefined): string {
  const d = new Date(raw ?? Date.now());
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) return new Date().toISOString();
  return d.toISOString();
}
