import assert from "node:assert/strict";
import test from "node:test";
import { MAX_EXCERPT, excerpt, isRepeat, sportOf, isCombatNews } from "./without-ai";
import { SOURCES, snippetOf } from "./feeds";
import { FRENCH_PUBLISHERS } from "../lib/rss-sources";

test("les sources actives et les listes publiques utilisent la même sélection française", () => {
  assert.ok(SOURCES.length > 0);
  assert.ok(SOURCES.every((s) => s.language === "fr" || s.youtube));
  assert.deepEqual(FRENCH_PUBLISHERS, SOURCES.map((s) => s.name));
  assert.ok(!FRENCH_PUBLISHERS.includes("UFC"));
});

test("un flux WordPress à description vide fournit un extrait sans légende ni HTML", () => {
  const html = '<figure><img src="photo.jpg"><figcaption>Crédit : UFC.</figcaption></figure><p>Un combat est annoncé &amp; confirmé.</p>';
  assert.equal(snippetOf("", "", html, "Crédit : UFC. Un combat est annoncé & confirmé."), "Un combat est annoncé & confirmé.");
  assert.equal(snippetOf("", "", undefined, undefined), "");
});
test("un flux multisport distingue les combats et classe les disciplines explicites", () => {
  assert.equal(isCombatNews("NBA : une nouvelle saison", "Le calendrier de basket est annoncé."), false);
  assert.equal(isCombatNews("Un combat est annoncé", "L'UFC dévoile une affiche."), true);
  assert.equal(sportOf("Championnats de muay thaï : inscriptions", "kickboxing"), "muay-thai");
  assert.equal(sportOf("Boxe : un nouveau champion", "mma"), "boxe");
});
test("l'extrait est court, ne répète pas le titre et les variantes de titre sont dédoublonnées", () => {
  const title = "Une annonce de boxe";
  const text = excerpt(`${title}. Une information confirmée. ${"Texte supplémentaire. ".repeat(30)}`, title);
  assert.ok(text.length <= MAX_EXCERPT + 1);
  assert.ok(!text.startsWith(title));
  assert.ok(!text.includes("undefined"));
  assert.equal(isRepeat(new Map([["boxe", ["Événement : le retour !"]]]), "Evenement - le retour"), true);
});

test("le texte complet d'un média autorisé garde les paragraphes, sans photo ni mention finale", async () => {
  const { fullText } = await import("./without-ai");
  const html = '<p>Premier &amp; paragraphe.</p><figure><img src="a.jpg"><figcaption>Légende</figcaption></figure><p>Second <strong>paragraphe</strong>.</p><p>L’article Titre est apparu en premier sur Média.</p>';
  assert.equal(fullText(html), "Premier & paragraphe.\n\nSecond paragraphe.");
});

test("le résumé va jusqu'à environ 700 caractères, coupé en fin de phrase", () => {
  const phrase = "Le combat principal est confirmé pour décembre à Paris. ";
  const text = excerpt(phrase.repeat(20), "");
  assert.ok(text.length > 500 && text.length <= 700);
  assert.ok(text.endsWith("."));
});
