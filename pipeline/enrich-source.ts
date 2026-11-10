/**
 * Lecture de la page d'un article cité, pour le skill « enrichir-articles » (.claude/skills/enrichir-articles).
 *
 * Le robot RSS n'enregistre qu'un titre et un court extrait. Ce script lit la page de l'article chez son
 * média (une fois, et seulement si le robots.txt du site le permet) et en sort le texte brut : titre,
 * chapô, intertitres et paragraphes. Claude s'en sert comme matière pour écrire une synthèse en français,
 * avec ses propres mots : ce texte n'est jamais publié tel quel.
 *
 *   npm run enrich:source -- <adresse de l'article>
 *
 * Affiche un JSON { url, title, description, published, paragraphs[] } ou { url, error }.
 */
import { decode, download } from "./feeds";
import { robotsForbids } from "./robots";

export type SourceText = { title?: string; description?: string; published?: string; paragraphs: string[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—" };

// Lettres accentuées nommées (&eacute;, &acirc;, &euml;…) : lettre + accent combinant, recomposés par normalize().
const ACCENTS: Record<string, string> = { acute: "\u0301", grave: "\u0300", circ: "\u0302", uml: "\u0308", tilde: "\u0303", cedil: "\u0327", ring: "\u030a" };

const decodeOnce = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
    const accent = /^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i.exec(e);
    if (accent) return (accent[1] + ACCENTS[accent[2].toLowerCase()]).normalize("NFC");
    if (/^oelig$/i.test(e)) return e[0] === "O" ? "Œ" : "œ";
    return m;
  });

// Certains sites encodent deux fois (« d&amp;eacute;g&amp;acirc;ts ») : on décode jusqu'à stabilité.
const decodeEntities = (s: string) => {
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
};

const clean = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const meta = (html: string, key: string) => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = /\s(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (k === key) return clean(/\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)?.slice(1).find((v) => v !== undefined) ?? "") || undefined;
  }
};

// Phrases de service qu'on retrouve dans les pages des médias, sans rapport avec l'article.
const NOISE = /cookies?|newsletter|abonnez|inscrivez|partager sur|lire aussi|à lire aussi|publicité|tous droits réservés|javascript|copyright|©/i;

/** Texte d'une page d'article : fonction pure, testable sans réseau. */
export function articleTextOf(html: string): SourceText {
  const title = meta(html, "og:title") ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : undefined);
  const description = meta(html, "og:description") ?? meta(html, "description");
  const published = meta(html, "article:published_time") ?? meta(html, "datepublished");

  // On retire ce qui n'est jamais le corps de l'article.
  const body = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure|iframe|template)\b[\s\S]*?<\/\1>/gi, " ");
  // Le bloc <article> le plus riche en texte, s'il est vraiment l'article (certains sites n'emploient
  // <article> que pour les vignettes « à lire aussi ») ; sinon toute la page.
  const whole = paragraphsOf(body);
  const best = [...body.matchAll(/<article\b[\s\S]*?<\/article>/gi)]
    .map((m) => paragraphsOf(m[0]))
    .sort((a, b) => size(b) - size(a))[0];
  const paragraphs = best && size(best) >= 400 ? best : whole;
  // Les intertitres isolés (vignettes avant l'article, rubriques en fin de page) n'apportent rien.
  while (paragraphs.length > 1 && paragraphs[0].startsWith("## ") && paragraphs[1].startsWith("## ")) paragraphs.shift();
  while (paragraphs.length && paragraphs[paragraphs.length - 1].startsWith("## ")) paragraphs.pop();
  return { title, description, published, paragraphs };
}

const size = (lines: string[]) => lines.reduce((n, l) => n + (l.startsWith("## ") ? 0 : l.length), 0);

function paragraphsOf(html: string): string[] {
  const paragraphs: string[] = [];
  for (const m of html.matchAll(/<(p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = clean(m[2]);
    const tag = m[1].toLowerCase();
    const heading = tag.startsWith("h");
    if (!text || (!heading && text.length < 40) || (NOISE.test(text) && text.length < 200)) continue;
    const line = heading ? `## ${text}` : tag === "blockquote" ? `> ${text}` : text;
    if (paragraphs[paragraphs.length - 1] !== line) paragraphs.push(line);
  }
  return paragraphs;
}

export async function readSourceText(url: string): Promise<SourceText & { url: string; error?: string }> {
  if (!/^https?:\/\//i.test(url)) return { url, paragraphs: [], error: "adresse invalide" };
  const forbidden = await robotsForbids(url);
  if (forbidden) return { url, paragraphs: [], error: `robots.txt l'interdit (${forbidden})` };
  const res = await download(url);
  if (res.status >= 300) return { url, paragraphs: [], error: `HTTP ${res.status}` };
  return { url, ...articleTextOf(decode(res.body, res.contentType)) };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("enrich-source.ts")) {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage : npm run enrich:source -- <adresse de l'article>");
    process.exit(1);
  }
  readSourceText(url)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e: Error) => console.log(JSON.stringify({ url, paragraphs: [], error: e.message })));
}
