import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import Parser from "rss-parser";
import sources from "./sources.json";

// Lecture des flux RSS, partagée par le robot (run.ts) et le vérificateur (check-sources.ts).

export type Source = {
  name: string;
  url: string;
  sport: string;       // rubrique suggérée à l'IA
  official?: boolean;  // site officiel (fédération, organisation) : badge "Officiel" sur le site
};

export const SOURCES = sources as Source[];

export const MAX_NEW_PER_RUN = 25; // plafond par passage du robot, pour maîtriser le coût IA

/** Lit les flux 6 par 6 : un site lent ne bloque pas les autres. */
export async function eachSource<R>(fn: (s: Source) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < SOURCES.length; i += 6) out.push(...(await Promise.all(SOURCES.slice(i, i + 6).map(fn))));
  return out;
}

type SourceEl = string | { _?: string; $?: { url?: string } };

export const USER_AGENT = "Mozilla/5.0 (compatible; FightNewsBot/1.0; +https://github.com/jacques225/FightNews)";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
};

// Un lecteur neuf à chaque flux : après une erreur, celui de rss-parser peut rester dans un état incohérent.
const parse = (xml: string) =>
  new Parser<Record<string, never>, { sourceEl?: SourceEl }>({ customFields: { item: [["source", "sourceEl"]] } }).parseString(xml);

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
    const deadline = setTimeout(() => req.destroy(new Error("pas de réponse en 20 s")), 20_000);
    req.on("error", (e) => {
      clearTimeout(deadline);
      reject(e);
    });
  });
}

/** Télécharge et lit un flux RSS ou Atom. */
export async function readFeed(url: string) {
  const res = await download(url);
  if (res.status >= 300) throw new Error(`Status code ${res.status}`);
  const xml = decode(res.body, res.contentType).replace(/^\uFEFF/, "");
  // Certains sites renvoient une page web (souvent une protection anti-robots) à la place du flux.
  if (/^\s*(<!doctype html|<html)/i.test(xml)) throw new Error("page web au lieu d'un flux RSS");
  try {
    return await parse(xml);
  } catch (e) {
    try {
      return await parse(repairXml(xml));
    } catch {
      throw xmlError(e as Error, xml);
    }
  }
}

// Des sites laissent du HTML brut dans leur flux (<br>, <img> sans fin de balise) et le lecteur XML refuse tout le flux.
// On ferme ces balises, hors blocs CDATA, avant de réessayer.
function repairXml(xml: string) {
  return xml
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

/** Date ISO fiable : jamais dans le futur, maintenant si la date du flux est illisible. */
export function itemDate(raw: string | undefined): string {
  const d = new Date(raw ?? Date.now());
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) return new Date().toISOString();
  return d.toISOString();
}
