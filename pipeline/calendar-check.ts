/**
 * Lit le calendrier des combats sur Wikipédia comme le site, et affiche ce qu'il en tire : les prochains
 * événements de chaque organisation, leur carte, et les catégories de poids que le site ne sait pas traduire.
 * Échoue si une page n'a pas pu être lue (Wikipédia a changé sa mise en page ?) ou si le calendrier est vide.
 * Tourne sur GitHub avec la vérification des sources (chaque lundi, à chaque modification, ou à la main).
 *
 * Usage : npm run calendar:check
 */
import { appendFileSync } from "node:fs";
import { ORGS, loadCalendar, mainBout, segmentFr, weightFr } from "../lib/calendar";

async function main() {
  const { events, errors } = await loadCalendar();

  const untranslated = new Set<string>();
  for (const e of events) {
    console.log(`\n${e.date}  ${e.org} · ${e.name} · ${[e.venue, e.location].filter(Boolean).join(", ")}`);
    console.log(`  ${e.url}`);
    if (!e.card.length) console.log("  (carte pas encore annoncée)");
    for (const s of e.card) {
      console.log(`  ${segmentFr(s.name) || "Carte"} :`);
      for (const b of s.bouts) {
        const weight = weightFr(b.weight);
        if (b.weight && weight === b.weight) untranslated.add(b.weight);
        console.log(`    ${weight || "?"} · ${b.a} ${b.done ? "bat" : "vs"} ${b.b}${b.title ? " · titre" : ""}`);
      }
    }
  }

  const rows = ORGS.map((org) => {
    const list = events.filter((e) => e.org === org);
    const next = list[0];
    const main = next && mainBout(next);
    return {
      org,
      events: list.length,
      cards: list.filter((e) => e.card.length).length,
      bouts: list.reduce((n, e) => n + e.card.reduce((m, s) => m + s.bouts.length, 0), 0),
      next: next ? `${next.date} ${next.name}${main ? ` (${main.a} vs ${main.b})` : ""}` : "",
    };
  });
  console.log("");
  console.table(rows);
  if (untranslated.size) console.log(`Catégories non traduites : ${[...untranslated].join(" ; ")}`);
  for (const e of errors) console.error(`✗ ${e}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "## Calendrier des combats (Wikipédia)",
      "",
      "| Organisation | Événements à venir | Avec leur carte | Combats | Prochain |",
      "|---|---:|---:|---:|---|",
      ...rows.map((r) => `| ${r.org} | ${r.events} | ${r.cards} | ${r.bouts} | ${r.next.replace(/\|/g, "/")} |`),
      "",
      ...(untranslated.size ? [`Catégories non traduites : ${[...untranslated].join(" ; ")}`, ""] : []),
      ...errors.map((e) => `- ✗ ${e}`),
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }

  if (errors.length || !events.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
