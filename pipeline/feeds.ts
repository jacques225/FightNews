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

const parser = new Parser<Record<string, never>, { sourceEl?: SourceEl }>({
  customFields: { item: [["source", "sourceEl"]] },
});

/**
 * Télécharge et lit un flux. Le téléchargement passe par fetch, qui coupe vraiment
 * la connexion au bout de 20 s (celui de rss-parser la laisse ouverte, et la tâche GitHub ne s'arrête plus).
 */
export async function readFeed(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Status code ${res.status}`);
  }
  return parser.parseString(decode(await res.arrayBuffer(), res.headers.get("content-type")));
}

// La plupart des flux sont en UTF-8, quelques-uns en ISO-8859-1 : on lit l'encodage annoncé.
function decode(buf: ArrayBuffer, contentType: string | null) {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 200));
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ?? /encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// Google Actualités indique le vrai média dans <source> et à la fin du titre ("Titre - L'Équipe").
// On cite ce média plutôt que "Google Actualités".
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
