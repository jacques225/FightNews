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

export const parser = new Parser<Record<string, never>, { sourceEl?: SourceEl }>({
  timeout: 20000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; FightNewsBot/1.0; +https://github.com/jacques225/FightNews)" },
  customFields: { item: [["source", "sourceEl"]] },
});

// Google Actualités indique le vrai média dans <source> et à la fin du titre ("Titre - L'Équipe").
// On cite ce média plutôt que "Google Actualités".
export function publisherOf(el: SourceEl | undefined, title: string, fallback: string) {
  const name = typeof el === "string" ? el : el?._;
  if (name?.trim()) return { publisher: name.trim(), title: title.replace(new RegExp(`\\s+-\\s+${escapeRe(name.trim())}$`), "") };
  return { publisher: fallback, title };
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Date ISO fiable : jamais dans le futur, maintenant si la date du flux est illisible. */
export function itemDate(raw: string | undefined): string {
  const d = new Date(raw ?? Date.now());
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) return new Date().toISOString();
  return d.toISOString();
}
