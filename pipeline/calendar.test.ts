import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./fixtures/wikipedia.json";
import { parseAnnounced, parseCard, parseDate, parseEventList, splitSections, withSubsections } from "../lib/wikitext";
import { ANNOUNCED, dateParts, loadCalendar, mainBout, monthLabel, segmentFr, shortName, weightFr, wikiUrl } from "../lib/calendar";

// Extraits réels des pages Wikipédia (voir fixtures/wikipedia.json) : si Wikipédia change sa mise en page,
// `npm run calendar:check` le signale sur GitHub, et ces extraits sont à relever de nouveau.
const PAGES: Record<string, string> = fixtures.pages;

/** Texte d'une section (et de ses sous-sections) ; `nth` pour les titres répétés (« Results »). */
function section(page: string, title: string, nth = 0) {
  const all = splitSections(PAGES[page]);
  const i = all.map((s, k) => (s.title === title ? k : -1)).filter((k) => k >= 0)[nth];
  assert.ok(i !== undefined, `section « ${title} » absente de ${page}`);
  return withSubsections(all, i).map((s) => s.text).join("\n");
}

const NOW = new Date("2026-09-29T12:00:00Z");

/** Wikipédia simulé : répond à l'API comme la vraie (formatversion=2), avec les pages données. */
function fakeWikipedia(pages: Record<string, string>, opts: { redirects?: Record<string, string>; status?: Record<string, number> } = {}) {
  const calls: string[][] = [];
  const fetch = async (input: string | URL | Request) => {
    const titles = new URL(String(input)).searchParams.get("titles")!.split("|");
    calls.push(titles);
    const status = titles.map((t) => opts.status?.[t]).find(Boolean);
    if (status) return new Response("indisponible", { status });
    const redirects = titles.filter((t) => opts.redirects?.[t]).map((t) => ({ from: t, to: opts.redirects![t] }));
    const finals = titles.map((t) => opts.redirects?.[t] ?? t);
    return Response.json({
      batchcomplete: true,
      query: {
        redirects,
        pages: finals.map((t) =>
          pages[t] === undefined ? { title: t, missing: true } : { title: t, revisions: [{ slots: { main: { content: pages[t] } } }] },
        ),
      },
    });
  };
  return { calls, fetch };
}

test("liste de l'UFC : pages des événements, dates et cellules fusionnées", () => {
  const events = parseEventList(section("List of UFC events", "Scheduled events"));
  assert.equal(events.length, 9);
  assert.deepEqual(events.find((e) => e.page === "UFC 332"), {
    name: "UFC 332: Silva vs. Wang", page: "UFC 332", anchor: undefined, date: "2026-10-03", venue: "Delta Center", location: "Salt Lake City, Utah, U.S.",
  });
  // Salle et ville écrites une fois pour deux événements (rowspan=2), puis la ligne suivante reprend normalement.
  const [bonfim, moicano, ufc333] = events.filter((e) => ["2026-11-07", "2026-10-31", "2026-10-24"].includes(e.date));
  assert.equal(bonfim.venue, "Meta Apex");
  assert.deepEqual([moicano.name, moicano.venue, moicano.location], ["UFC Fight Night: Moicano vs. Nolan", "Meta Apex", "Las Vegas, Nevada, U.S."]);
  assert.deepEqual([ufc333.page, ufc333.venue], ["UFC 333", "Etihad Arena"]);
  assert.equal(events.find((e) => e.name === "UFC 335")?.date, "2026-12-12");
});

test("pages annuelles : événements par ancre, par nom sans lien, colonnes ville et pays", () => {
  const ksw = parseEventList(section("2026 in Konfrontacja Sztuk Walki", "List of events"));
  assert.equal(ksw.length, 11);
  assert.deepEqual(ksw.at(-1), {
    name: "XTB KSW 124: Pawlak vs. Kuberski", page: undefined, anchor: "XTB KSW 124: Pawlak vs. Kuberski", date: "2026-12-19", venue: "Gliwice Arena", location: "Gliwice, Poland",
  });

  const one = parseEventList(section("2026 in ONE Championship", "Scheduled events"));
  assert.deepEqual(one.map((e) => [e.name, e.anchor ?? null, e.date]), [
    ["ONE Fight Night 50", null, "2026-12-12"],
    ["ONE Fight Night 49", null, "2026-11-07"],
    ["ONE Samurai 4", "ONE Samurai 4", "2026-10-17"],
    ["ONE Fight Night 48", "ONE Fight Night 48", "2026-10-03"],
  ]);
  assert.equal(one[0].location, "Bangkok, Thailand");

  const cw = parseEventList(section("2026 in Cage Warriors", "List of events"));
  const cw202 = cw.find((e) => e.name === "Cage Warriors 202")!;
  assert.deepEqual([cw202.date, cw202.venue, cw202.location], ["2026-03-14", "BEC Arena", "Manchester, England"]);
  assert.equal(cw.find((e) => e.name === "Cage Warriors 203")?.venue, "Indigo at The O2");

  const pfl = parseEventList(section("List of Professional Fighters League events", "Scheduled events"));
  assert.deepEqual(pfl.map((e) => e.page ?? null), ["PFL Lyon: Lapilus vs. McKee", "PFL Dubai: Nemkov vs. Bilostenniy", "PFL Chicago: Carmouche vs. Bishop 2", null, null]);

  const rizin = parseEventList(section("2026 in Rizin Fighting Federation", "List of events"));
  assert.deepEqual(rizin.at(-1), { name: "Rizin: New Year's Eve Event", page: undefined, anchor: undefined, date: "2026-12-31", venue: "Vantelin Dome Nagoya", location: "Nagoya, Japan" });

  assert.equal(parseEventList(section("2026 in Glory", "List of events")).length, 9);
});

test("carte de l'UFC : segments, catégories, champions", () => {
  const card = parseCard(section("UFC 332", "Fight card"));
  assert.deepEqual(card.map((s) => [s.name, s.bouts.length]), [
    ["Main card (Paramount+ / CBS)", 5],
    ["Preliminary card (Paramount+)", 4],
    ["Early preliminary card (Paramount+)", 4],
  ]);
  assert.deepEqual(card[0].bouts[0], { weight: "Women's Flyweight", a: "Natália Silva", b: "Wang Cong", title: true });
  assert.deepEqual(card[0].bouts[1], { weight: "Bantamweight", a: "Deiveson Figueiredo", b: "Payton Talbott", title: false });

  const ufc333 = parseCard(section("UFC 333", "Fight card"))[0].bouts;
  assert.deepEqual(ufc333.slice(0, 2).map((b) => [b.a, b.b, b.title]), [
    ["Alexander Volkanovski", "Movsar Evloev", true],
    ["Petr Yan", "Merab Dvalishvili", true],
  ]);

  const pfl = parseCard(section("PFL Lyon: Lapilus vs. McKee", "Fight card"));
  assert.deepEqual(pfl[0].bouts[0], { weight: "Bantamweight", a: "Taylor Lapilus", b: "Mitchell McKee", title: true });
});

test("cartes en tableau (ONE, Glory) et dans les pages annuelles (KSW)", () => {
  const one = parseCard(section("2026 in ONE Championship", "Results", 0));
  assert.equal(one.length, 1);
  assert.equal(one[0].bouts.length, 8);
  assert.deepEqual(one[0].bouts[0], { weight: "Bantamweight Kickboxing", a: "Jonathan Haggerty", b: "Hiroki Akimoto", title: true });
  assert.deepEqual(one[0].bouts[2], { weight: "Lightweight Kickboxing", a: "Rukiya Anpo", b: "Bogdan Shumarov", title: false });
  assert.deepEqual(parseCard(section("2026 in ONE Championship", "Results", 1))[0].bouts.map((b) => b.title), [true, false, false]);
  // Titre vacant : signalé seulement dans les notes, sans « (c) ».
  const vacant = "{|\n|-\n|Flyweight MMA\n|[[A]]\n|vs.\n|B\n|\n|\n|\n|For the vacant [[ONE Flyweight World Championship]].\n|}";
  assert.equal(parseCard(vacant)[0].bouts[0].title, true);

  const glory = parseCard(section("2026 in Glory", "Glory Rivals 6"));
  assert.deepEqual(glory[0].bouts.map((b) => b.weight), ["Lightweight 70 kg", "Welterweight 77 kg", "Middleweight 85 kg", "Light Heavyweight 95 kg"]);
  assert.deepEqual([glory[0].bouts[0].a, glory[0].bouts[0].b], ["Tayfun Özcan", "Anouar Afakir"]);

  const ksw = parseCard(section("2026 in Konfrontacja Sztuk Walki", "Fight card"));
  assert.deepEqual(ksw, [{ name: "Main card (Canal+ / KSWTV)", bouts: [{ weight: "Middleweight", a: "Paweł Pawlak", b: "Piotr Kuberski", title: true }] }]);
});

test("combats annoncés, pas encore placés sur la carte", () => {
  assert.deepEqual(parseAnnounced(section("UFC 335", "Announced bouts")), [
    { weight: "Middleweight", a: "Sean Strickland", b: "Nassourdine Imavov", title: true },
  ]);
  const ufc333 = parseAnnounced(section("UFC 333", "Announced bouts"));
  assert.deepEqual(ufc333.map((b) => `${b.weight}: ${b.a} vs ${b.b}`), [
    "Featherweight: Aaron Pico vs Losene Keita",
    "Middleweight: Jacob Malkoun vs Abubakar Vagaev",
    "Bantamweight: Colby Thicknesse vs Asaf Chopurov",
  ]);
});

test("tableau en plusieurs parties : une seule carte, sans les combats aux deux adversaires inconnus", () => {
  // Comme Glory 110 et Glory Collision 10 : deux en-têtes au nom de l'événement, un tournoi pas encore tiré au sort.
  const table = (title: string, rows: string[][]) =>
    `{|\n|-\n! colspan="8" | '''${title}'''\n|-\n! Weight Class !! !! !! !! Method !! Round !! Time !! Notes\n` +
    rows.map((r) => `|-\n|${r[0]}\n|${r[1]}\n|vs.\n|${r[2]}\n|\n|\n|\n|\n`).join("") +
    "|}";
  const card = parseCard(
    table("Glory 110", [["Featherweight 65 kg", "[[Miguel Trindade]] (c)", "Deniz Demirkapu"]]) +
      "\n" +
      table("Glory 110 Countdown", [["Welterweight 77 kg", "TBA", "{{TBA}}"], ["Welterweight 77 kg", "Chico Kwasi", "TBD"]]),
  );
  assert.deepEqual(card, [
    {
      name: "",
      bouts: [
        { weight: "Featherweight 65 kg", a: "Miguel Trindade", b: "Deniz Demirkapu", title: true },
        { weight: "Welterweight 77 kg", a: "Chico Kwasi", b: "À désigner", title: false },
      ],
    },
  ]);
});

test("le soir de l'événement, les combats disputés restent, avec leur vainqueur", () => {
  const card = parseCard(
    "{{MMAevent card|Main card}}\n{{MMAevent bout|Lightweight|[[Justin Gaethje]] (c)|def.|[[Paddy Pimblett]]|KO (punch)|1|0:42|For the title.}}\n{{MMAevent bout|Welterweight|TBA|vs.|[[Kevin Holland]]||||}}",
  );
  assert.deepEqual(card[0].bouts, [
    { weight: "Lightweight", a: "Justin Gaethje", b: "Paddy Pimblett", title: true, done: true },
    { weight: "Welterweight", a: "À désigner", b: "Kevin Holland", title: false },
  ]);
});

test("dates écrites de toutes les façons utilisées sur Wikipédia", () => {
  assert.equal(parseDate("{{dts|2026|Dec|12}}"), "2026-12-12");
  assert.equal(parseDate("{{dts|2026|December|19}}"), "2026-12-19");
  assert.equal(parseDate("{{dts|2026|10|03}}"), "2026-10-03");
  assert.equal(parseDate("{{Start date|2026|11|7|df=y}}"), "2026-11-07");
  assert.equal(parseDate("December 12, 2026"), "2026-12-12");
  assert.equal(parseDate("12 December 2026<ref>x</ref>"), "2026-12-12");
  assert.equal(parseDate("TBA"), null);
});

test("libellés en français", () => {
  assert.equal(weightFr("Women's Flyweight"), "Poids mouches féminin");
  assert.equal(weightFr("Light Heavyweight 95 kg"), "Poids mi-lourds, 95 kg");
  assert.equal(weightFr("Atomweight Muay Thai"), "Muay thaï · Poids atomes");
  assert.equal(weightFr("Women's Atomweight MMA"), "MMA · Poids atomes féminin");
  assert.equal(weightFr("Catchweight (160 lb)"), "Poids intermédiaire, 160 lb");
  assert.equal(weightFr("Tournament semi-final"), "Tournament semi-final");
  assert.equal(segmentFr("Main card (Paramount+ / CBS)"), "Carte principale · Paramount+ / CBS");
  assert.equal(segmentFr("Early preliminary card (Paramount+)"), "Préliminaires d'ouverture · Paramount+");
  assert.equal(segmentFr("Preliminary card"), "Préliminaires");
  assert.equal(segmentFr("Fight card (Paramount+)"), "Carte · Paramount+");
  assert.equal(segmentFr("Kickboxing bouts"), "Combats de kickboxing");
  assert.equal(segmentFr("Opening Ceremony: Rizin MMA Special Rules (5min / 2R)"), "Ouverture de la soirée · 5min / 2R");
  assert.equal(segmentFr("Superfight series"), "Superfight series");
  assert.equal(weightFr("Welteweight"), "Poids mi-moyens");
  assert.equal(shortName("UFC 332: Silva vs. Wang"), "UFC 332");
  assert.equal(shortName("Rizin: New Year's Eve Event"), "Rizin: New Year's Eve Event");
  assert.deepEqual(dateParts("2026-10-03"), { weekday: "sam.", day: "3", month: "oct.", long: "samedi 3 octobre 2026" });
  assert.equal(monthLabel("2026-12-19"), "Décembre 2026");
  assert.equal(wikiUrl("UFC Fight Night: Moicano vs. Nolan"), "https://en.wikipedia.org/wiki/UFC_Fight_Night:_Moicano_vs._Nolan");
  assert.equal(wikiUrl("2026 in Glory", "Glory Rivals 6"), "https://en.wikipedia.org/wiki/2026_in_Glory#Glory_Rivals_6");
  assert.equal(wikiUrl("Rizin 55", "Rizin 55 ?"), "https://en.wikipedia.org/wiki/Rizin_55#Rizin_55_%3F");
});

test("calendrier complet : toutes les organisations, triées par date, avec leur carte", async (t) => {
  const wiki = fakeWikipedia(PAGES);
  t.mock.method(globalThis, "fetch", wiki.fetch);
  const { events, errors } = await loadCalendar(NOW);

  assert.deepEqual(errors, []);
  // Une requête par page de liste (Oktagon et Brave n'ont pas encore la leur ici), plus une pour
  // toutes les pages d'événements de l'UFC, et une pour celles du PFL.
  assert.equal(wiki.calls.length, 11);
  assert.deepEqual(wiki.calls.find((c) => c.includes("UFC 332"))?.length, 9);

  assert.deepEqual(events.slice(0, 4).map((e) => `${e.date} ${e.org} ${e.name}`), [
    "2026-10-02 PFL PFL MENA 11",
    "2026-10-03 UFC UFC 332: Silva vs. Wang",
    "2026-10-03 ONE ONE Fight Night 48",
    "2026-10-03 Rizin Rizin Landmark 16",
  ]);
  // Les événements passés (Cage Warriors 210, le 26 septembre) ne sont plus affichés.
  assert.ok(events.every((e) => e.date >= "2026-10-01"));
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);

  const ufc332 = events.find((e) => e.name.startsWith("UFC 332"))!;
  assert.equal(ufc332.id, "ufc-332-silva-vs-wang-2026-10-03");
  assert.equal(ufc332.url, "https://en.wikipedia.org/wiki/UFC_332");
  assert.deepEqual(ufc332.card.map((s) => s.name), ["Main card (Paramount+ / CBS)", "Preliminary card (Paramount+)", "Early preliminary card (Paramount+)", ANNOUNCED]);
  assert.equal(mainBout(ufc332)?.a, "Natália Silva");

  const ufc335 = events.find((e) => e.name === "UFC 335")!;
  assert.deepEqual(ufc335.card.map((s) => s.name), [ANNOUNCED]);
  assert.equal(mainBout(ufc335)?.a, "Sean Strickland");

  const ksw = events.find((e) => e.name.startsWith("XTB KSW 124"))!;
  assert.equal(ksw.card[0].bouts[0].a, "Paweł Pawlak");
  assert.equal(ksw.url, "https://en.wikipedia.org/wiki/2026_in_Konfrontacja_Sztuk_Walki#XTB_KSW_124:_Pawlak_vs._Kuberski");

  const glory = events.find((e) => e.name === "Glory Rivals 6")!;
  assert.deepEqual([glory.sport, glory.card[0].bouts.length], ["kickboxing", 4]);

  // Sans page ni section (pas encore de carte) : lien vers la liste de l'organisation.
  const one50 = events.find((e) => e.name === "ONE Fight Night 50")!;
  assert.deepEqual([one50.card, one50.url], [[], "https://en.wikipedia.org/wiki/2026_in_ONE_Championship"]);
  assert.equal(events.find((e) => e.name === "PFL Africa 3")?.url, "https://en.wikipedia.org/wiki/List_of_Professional_Fighters_League_events");
});

test("pages renommées : Wikipédia suit la redirection", async (t) => {
  const { "PFL Lyon: Lapilus vs. McKee": lyon, ...others } = PAGES;
  const wiki = fakeWikipedia({ ...others, "PFL Lyon (2026)": lyon }, { redirects: { "PFL Lyon: Lapilus vs. McKee": "PFL Lyon (2026)" } });
  t.mock.method(globalThis, "fetch", wiki.fetch);
  const { events } = await loadCalendar(NOW);
  const event = events.find((e) => e.name === "PFL Lyon: Lapilus vs. McKee")!;
  assert.equal(event.url, "https://en.wikipedia.org/wiki/PFL_Lyon_(2026)");
  assert.equal(event.card[0].bouts.length, 4);
});

test("une page illisible ou une erreur de Wikipédia n'empêche pas d'afficher les autres organisations", async (t) => {
  const wiki = fakeWikipedia({ ...PAGES, "2026 in Glory": "==Background==\nPas de tableau." }, { status: { "List of Professional Fighters League events": 503 } });
  t.mock.method(globalThis, "fetch", wiki.fetch);
  const { events, errors } = await loadCalendar(NOW);
  assert.deepEqual(errors.sort(), ["2026 in Glory : tableau des événements introuvable", "List of Professional Fighters League events : Wikipédia a répondu 503"]);
  assert.ok(events.some((e) => e.org === "UFC"));
  assert.ok(!events.some((e) => e.org === "PFL" || e.org === "Glory"));
});

test("à partir d'octobre, la page de l'année suivante est lue aussi", async (t) => {
  const wiki = fakeWikipedia({ ...PAGES, "2027 in Konfrontacja Sztuk Walki": "==List of events==\n{|\n! Event !! Date !! Venue !! Location\n|-\n| [[#XTB KSW 125|XTB KSW 125]] || {{dts|2027|1|16}} || TBA || [[Warsaw]], Poland\n|}" });
  t.mock.method(globalThis, "fetch", wiki.fetch);
  const { events, errors } = await loadCalendar(new Date("2026-10-05T00:00:00Z"));
  assert.deepEqual(errors, []);
  assert.deepEqual(events.at(-1), {
    id: "xtb-ksw-125-2027-01-16", org: "KSW", sport: "mma", name: "XTB KSW 125", date: "2027-01-16", venue: "", location: "Warsaw, Poland", card: [],
    url: "https://en.wikipedia.org/wiki/2027_in_Konfrontacja_Sztuk_Walki",
  });
});
