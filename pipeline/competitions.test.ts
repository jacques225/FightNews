import { test } from "node:test";
import assert from "node:assert/strict";
import { cityCase, frenchDate, kindOf, parseFFKarate, parseFFKMDA, parseSmoothcomp, placeName, postcodeCity, tidyTitle } from "../lib/competitions";

test("Smoothcomp : lit la liste embarquée dans la page", () => {
  const html = `<script>var events = [{"id":32459,"title":"Grappling Industries PARIS","url":"https:\\/\\/grapplingindustries.smoothcomp.com\\/en\\/event\\/32459","eventEnded":false,"location_country":"FR","location_city":"Paris","categoryGroups":["1","7","3"],"startdate":"2026-11-08","enddate":"2026-11-08","note":"a ] b"},{"id":1,"title":"Old","url":"x","eventEnded":true,"startdate":"2026-01-01","enddate":"2026-01-01"}];
  var other = [];</script>`;
  const [c, ...rest] = parseSmoothcomp(html);
  assert.equal(rest.length, 0);
  assert.equal(c.url, "https://grapplingindustries.smoothcomp.com/en/event/32459");
  assert.equal(c.title, "Grappling Industries PARIS");
  assert.deepEqual(c.disciplines, ["JJB", "JJB no-gi", "Submission"]);
  assert.equal(c.sport, "grappling");
});

test("FFKarate : garde les épreuves, écarte stages et grades", () => {
  const posts = [
    { id: 1, link: "https://www.ffkarate.fr/calendrier/a/", title: { rendered: "Coupe de France Karate lei tai" }, acf: { date_debut: "2026-11-21 00:00:00", date_fin: "2026-11-21 00:00:00" }, class_list: ["category-contact"], "event-location": [7] },
    { id: 2, link: "x", title: { rendered: "Stage interrégional amv" }, acf: { date_debut: "2026-12-12 00:00:00" }, class_list: ["category-amv"] },
    { id: 3, link: "x", title: { rendered: "Passage de grades Zone Nord" }, acf: { date_debut: "2026-12-05 00:00:00" } },
    { id: 4, link: "x", title: { rendered: "Coupe de France passée" }, acf: { date_debut: "2026-10-01 00:00:00" } },
  ];
  const out = parseFFKarate(posts, new Map([[7, "Fontainebleau (77)"]]), "2026-11-06");
  assert.equal(out.length, 1);
  assert.equal(out[0].city, "Fontainebleau (77)");
  assert.deepEqual(out[0].disciplines, ["Karaté contact"]);
  assert.equal(out[0].kind, "Coupe de France");
});

test("FFKMDA : date et ville écrites dans le texte", () => {
  const posts = [{
    id: 9, link: "https://www.ffkmda.com/evenements/fkr/", title: { rendered: "FKR FIGHT SERIES 3" },
    content: { rendered: "<p>Le FKR Fight Series 3</p><p>Samedi 7 novembre 2026</p><p>Gymnase Vervoort (Route de Champien, 80700 Roye, France)</p>" },
    class_list: ["event_category-galas", "event_discipline-kickboxing"],
  }];
  const [c] = parseFFKMDA(posts, "2026-11-06");
  assert.equal(c.start, "2026-11-07");
  assert.equal(c.city, "Roye");
  assert.equal(c.kind, "Gala");
  assert.equal(c.title, "FKR fight series 3");
});

test("petits utilitaires", () => {
  assert.equal(frenchDate("le 1er février 2027 à 18h"), "2027-02-01");
  assert.equal(frenchDate("rien"), "");
  assert.equal(postcodeCity("Salle, 75011 Paris, France"), "Paris");
  assert.equal(placeName("Palais des sports - Béziers (34)"), "Béziers (34)");
  assert.equal(placeName("-- En attente de confirmation de la salle --"), "");
  assert.equal(placeName("Grand Dôme - VILLEBON-SUR-YVETTE (91)"), "Villebon-Sur-Yvette (91)");
  assert.equal(cityCase("la rochelle"), "La Rochelle");
  assert.equal(tidyTitle("CHAMPIONNATS D’EUROPE DE KICKBOXING WAKO"), "Championnats d’Europe de kickboxing WAKO");
  assert.equal(tidyTitle("Open de Paris"), "Open de Paris");
  assert.equal(kindOf("Tournoi JJB Antony 2026"), "Tournoi");
});
