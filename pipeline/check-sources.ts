/**
 * Vérifie chaque flux de pipeline/sources.json : le site autorise-t-il les robots à le lire (robots.txt),
 * répond-il, combien d'articles, de quand date le plus récent, combien sont parus ces dernières 24 h.
 * Estime aussi le nombre d'infos que le robot traitera par jour, sans coût IA.
 * Tourne sur GitHub (même réseau que le robot) à chaque modification des sources et chaque lundi.
 *
 * Usage : npm run sources:check
 */
import { appendFileSync } from "node:fs";
import { MAX_NEW_PER_RUN, UnavailableError, eachSource, imageOf, itemDate, readSource, type Source, MissingKeyError } from "./feeds";
import { robotsForbids } from "./robots";

const STALE_DAYS = 30;
const DAY = 86400_000;
// Le robot passe toutes les 30 minutes (.github/workflows/pipeline.yml).
const MAX_PER_DAY = MAX_NEW_PER_RUN * 48;

type Result = {
  name: string; sport: string; official: boolean; url: string;
  ok: boolean; items: number; lastDay: string[]; latest?: string; title?: string; error?: string;
  photos?: number; photo?: string; // articles avec une photo fournie dans le flux, et un exemple
  unavailable?: boolean; // indisponible deux fois de suite (délai dépassé, erreur 5xx) : à surveiller, souvent passager
};

function age(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}

const isStale = (r: Result) => Date.now() - new Date(r.latest!).getTime() > STALE_DAYS * DAY;
// Un flux dont tous les articles datent de moins de 24 h en publie sans doute plus qu'il n'en affiche.
const isFull = (r: Result) => r.items > 0 && r.lastDay.length === r.items;

// Un site peut être lent ou indisponible un instant : on réessaie une fois avant de le compter en panne.
async function readTwice(s: Source) {
  try {
    return await readSource(s);
  } catch (e) {
    if (e instanceof MissingKeyError) throw e; // inutile de réessayer sans clé
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return readSource(s);
  }
}

async function check(s: Source): Promise<Result> {
  const base = { name: s.name, sport: s.sport, official: Boolean(s.official), url: s.url, lastDay: [] as string[] };
  // Une chaîne YouTube se lit par l'API officielle de Google, pas en visitant le site : pas de robots.txt à lire.
  const forbidden = s.youtube ? null : await robotsForbids(s.url);
  if (forbidden) return { ...base, ok: false, items: 0, error: `le site interdit aux robots de lire ce flux (robots.txt : « ${forbidden} »)` };
  try {
    const feed = await readTwice(s);
    const dated = feed.items
      .map((it) => ({ title: it.title ?? "", link: it.link ?? "", date: itemDate(it.isoDate ?? it.pubDate), photo: imageOf(it) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastDay = dated.filter((d) => d.link && Date.now() - new Date(d.date).getTime() < DAY).map((d) => d.link);
    return {
      ...base, ok: feed.items.length > 0, items: feed.items.length, lastDay,
      latest: dated[0]?.date, title: dated[0]?.title, error: feed.items.length ? undefined : "flux vide",
      photos: dated.filter((d) => d.photo).length, photo: dated.find((d) => d.photo)?.photo,
    };
  } catch (e) {
    return { ...base, ok: false, items: 0, unavailable: e instanceof UnavailableError, error: (e as Error).message.split("\n")[0].slice(0, 120) };
  }
}

async function main() {
  const results = await eachSource(check);

  let broken = 0;
  let stale = 0;
  let unavailable = 0;
  for (const r of results) {
    const tag = `[${r.sport}]${r.official ? " [officiel]" : ""} ${r.name}`;
    const day = `${r.lastDay.length}${isFull(r) ? "+" : ""} ces dernières 24 h`;
    if (r.unavailable) {
      unavailable++;
      console.log(`⚠ ${tag} : ${r.error}, deux fois de suite (site momentanément indisponible, à surveiller)\n    ${r.url}`);
    } else if (!r.ok) {
      broken++;
      console.log(`✗ ${tag} : ${r.error}\n    ${r.url}`);
    } else if (isStale(r)) {
      stale++;
      console.log(`⚠ ${tag} : ${r.items} articles, mais le plus récent date de ${age(r.latest!)}\n    ${r.url}`);
    } else {
      console.log(`✓ ${tag} : ${r.items} articles (${day}, ${r.photos} avec photo), le plus récent il y a ${age(r.latest!)} : ${r.title}`);
      if (r.photo) console.log(`    photo : ${r.photo}`);
    }
  }

  // Le robot ignore un lien déjà vu, même s'il apparaît dans plusieurs flux.
  const perDay = new Set(results.flatMap((r) => r.lastDay)).size;
  const full = results.filter(isFull).length;
  const volume =
    `≈ ${perDay} nouvelles infos par jour` +
    (full ? ` (au moins : ${full} flux n'affichent que leurs derniers articles)` : "") +
    (perDay > MAX_PER_DAY ? `. Le robot en traite au plus ${MAX_PER_DAY} (${MAX_NEW_PER_RUN} par passage), les plus récentes d'abord` : "");
  const cost = "Coût IA : 0 — import RSS français sans génération ni traduction";

  console.log(`\n${results.length} sources : ${results.length - broken - stale - unavailable} OK, ${stale} inactives, ${unavailable} indisponibles, ${broken} en panne.`);
  console.log(`${volume}.\n${cost}.`);

  // Tableau récapitulatif affiché sur la page de la tâche GitHub.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (s: string) => s.replace(/\|/g, "/").slice(0, 80);
    const rows = results.map((r) => {
      const state = r.unavailable ? "⚠️ indisponible" : !r.ok ? "❌ en panne" : isStale(r) ? "⚠️ inactive" : "✅ OK";
      const detail = r.ok
        ? `${r.items} articles, ${r.lastDay.length}${isFull(r) ? "+" : ""} en 24 h, ${r.photos} avec photo, dernier il y a ${age(r.latest!)}`
        : cell(r.error ?? "");
      return `| ${state} | ${r.sport} | ${cell(r.name)}${r.official ? " (officiel)" : ""} | ${detail} |`;
    });
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Sources RSS\n\n${volume}.\n\n${cost}.\n\n| État | Rubrique | Source | Détail |\n|---|---|---|---|\n${rows.join("\n")}\n`,
    );
  }

  // En rouge si une source est en panne : GitHub te prévient, et une modification cassée se voit tout de suite.
  // Un site momentanément indisponible ne compte pas : le robot le relira au passage suivant.
  if (broken) process.exitCode = 1;
}

main();
