/**
 * Vérifie chaque flux de pipeline/sources.json : répond-il, combien d'articles,
 * de quand date le plus récent, combien sont parus ces dernières 24 h.
 * Estime aussi le nombre d'infos que le robot traitera par jour et ce que ça coûte en IA.
 * Tourne sur GitHub (même réseau que le robot) à chaque modification des sources et chaque lundi.
 *
 * Usage : npm run sources:check
 */
import { appendFileSync } from "node:fs";
import { MAX_NEW_PER_RUN, eachSource, itemDate, parser, type Source } from "./feeds";

const STALE_DAYS = 30;
const DAY = 86400_000;
// Le robot passe toutes les 30 minutes (.github/workflows/pipeline.yml).
const MAX_PER_DAY = MAX_NEW_PER_RUN * 48;
// Une brève avec Claude Haiku 4.5 (1 $ le million de tokens lus, 5 $ le million écrits) :
// environ 1 600 tokens lus (consignes, extrait, titres déjà publiés) et 350 écrits, soit 0,0034 $.
// À revoir si tu changes AI_MODEL.
const COST_PER_ITEM_USD = (1600 * 1 + 350 * 5) / 1_000_000;

type Result = {
  name: string; sport: string; official: boolean; url: string;
  ok: boolean; items: number; lastDay: string[]; latest?: string; title?: string; error?: string;
};

function age(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}

const isStale = (r: Result) => Date.now() - new Date(r.latest!).getTime() > STALE_DAYS * DAY;
// Un flux dont tous les articles datent de moins de 24 h en publie sans doute plus qu'il n'en affiche.
const isFull = (r: Result) => r.items > 0 && r.lastDay.length === r.items;
const usd = (n: number) => `${n.toFixed(n < 10 ? 2 : 0).replace(".", ",")} $`;

async function check(s: Source): Promise<Result> {
  const base = { name: s.name, sport: s.sport, official: Boolean(s.official), url: s.url, lastDay: [] as string[] };
  try {
    const feed = await parser.parseURL(s.url);
    const dated = feed.items
      .map((it) => ({ title: it.title ?? "", link: it.link ?? "", date: itemDate(it.isoDate ?? it.pubDate) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastDay = dated.filter((d) => d.link && Date.now() - new Date(d.date).getTime() < DAY).map((d) => d.link);
    return {
      ...base, ok: feed.items.length > 0, items: feed.items.length, lastDay,
      latest: dated[0]?.date, title: dated[0]?.title, error: feed.items.length ? undefined : "flux vide",
    };
  } catch (e) {
    return { ...base, ok: false, items: 0, error: (e as Error).message.split("\n")[0].slice(0, 120) };
  }
}

async function main() {
  const results = await eachSource(check);

  let broken = 0;
  let stale = 0;
  for (const r of results) {
    const tag = `[${r.sport}]${r.official ? " [officiel]" : ""} ${r.name}`;
    const day = `${r.lastDay.length}${isFull(r) ? "+" : ""} ces dernières 24 h`;
    if (!r.ok) {
      broken++;
      console.log(`✗ ${tag} : ${r.error}\n    ${r.url}`);
    } else if (isStale(r)) {
      stale++;
      console.log(`⚠ ${tag} : ${r.items} articles, mais le plus récent date de ${age(r.latest!)}\n    ${r.url}`);
    } else {
      console.log(`✓ ${tag} : ${r.items} articles (${day}), le plus récent il y a ${age(r.latest!)} : ${r.title}`);
    }
  }

  // Le robot ignore un lien déjà vu, même s'il apparaît dans plusieurs flux.
  const perDay = new Set(results.flatMap((r) => r.lastDay)).size;
  const treated = Math.min(perDay, MAX_PER_DAY);
  const full = results.filter(isFull).length;
  const volume =
    `≈ ${perDay} nouvelles infos par jour` +
    (full ? ` (au moins : ${full} flux n'affichent que leurs derniers articles)` : "") +
    (perDay > MAX_PER_DAY ? `. Le robot en traite au plus ${MAX_PER_DAY} (${MAX_NEW_PER_RUN} par passage), les plus récentes d'abord` : "");
  const cost = `Coût IA estimé (Claude Haiku 4.5) : ${usd(treated * COST_PER_ITEM_USD)} par jour, soit ${usd(treated * COST_PER_ITEM_USD * 30)} par mois`;

  console.log(`\n${results.length} sources : ${results.length - broken - stale} OK, ${stale} inactives, ${broken} en panne.`);
  console.log(`${volume}.\n${cost}.`);

  // Tableau récapitulatif affiché sur la page de la tâche GitHub.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (s: string) => s.replace(/\|/g, "/").slice(0, 80);
    const rows = results.map((r) => {
      const state = !r.ok ? "❌ en panne" : isStale(r) ? "⚠️ inactive" : "✅ OK";
      const detail = r.ok
        ? `${r.items} articles, ${r.lastDay.length}${isFull(r) ? "+" : ""} en 24 h, dernier il y a ${age(r.latest!)}`
        : cell(r.error ?? "");
      return `| ${state} | ${r.sport} | ${cell(r.name)}${r.official ? " (officiel)" : ""} | ${detail} |`;
    });
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Sources RSS\n\n${volume}.\n\n${cost}.\n\n| État | Rubrique | Source | Détail |\n|---|---|---|---|\n${rows.join("\n")}\n`,
    );
  }

  // En rouge si une source est en panne : GitHub te prévient, et une modification cassée se voit tout de suite.
  if (broken) process.exitCode = 1;
}

main();
