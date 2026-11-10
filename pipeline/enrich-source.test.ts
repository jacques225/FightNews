import assert from "node:assert/strict";
import test from "node:test";
import { articleTextOf } from "./enrich-source";

const filler = "Le combattant français a dominé les trois rounds face à un adversaire expérimenté, devant son public.";

test("le texte vient du bloc <article> principal, sans menus, scripts ni pied de page", () => {
  const html = `<html><head><meta property="og:title" content="Gane conserve son titre"><meta property="article:published_time" content="2026-11-10T10:00:00Z"></head><body>
    <nav><p>${filler} (menu)</p></nav>
    <article><h1>Gane</h1><p>${filler}</p><h2>La suite</h2><p>${filler.replace("français", "parisien")}</p><blockquote>« Je suis prêt pour la suite de ma carrière, et je le prouverai. »</blockquote>
    <p>${filler.replace("trois", "cinq")}</p><p>${filler.replace("public", "clan")}</p></article>
    <script>var p = "<p>${filler}</p>";</script><footer><p>${filler} (pied)</p></footer></body></html>`;
  const r = articleTextOf(html);
  assert.equal(r.title, "Gane conserve son titre");
  assert.equal(r.published, "2026-11-10T10:00:00Z");
  assert.equal(r.paragraphs[0], filler);
  assert.equal(r.paragraphs[1], "## La suite");
  assert.ok(r.paragraphs.some((p) => p.startsWith("> « Je suis prêt")));
  assert.ok(!r.paragraphs.some((p) => p.includes("(menu)") || p.includes("(pied)")));
});

test("des <article> qui ne sont que des vignettes : on lit toute la page", () => {
  const html = `<body><article><h3>À lire aussi</h3></article><div class="entry"><p>${filler}</p><p>Plus tard, il a annoncé vouloir défendre sa ceinture à Paris au printemps.</p></div></body>`;
  const r = articleTextOf(html);
  assert.equal(r.paragraphs.length, 2);
  assert.equal(r.paragraphs[0], filler);
});

test("les entités HTML sont décodées et les phrases trop courtes ignorées", () => {
  const r = articleTextOf(`<body><p>Court.</p><p>L&rsquo;UFC 334 aura lieu au Madison Square Garden &laquo;&nbsp;en novembre&nbsp;&raquo;.</p></body>`);
  assert.deepEqual(r.paragraphs, ["L’UFC 334 aura lieu au Madison Square Garden « en novembre »."]);
});

test("les lettres accentuées nommées et le double encodage sont décodés", () => {
  const r = articleTextOf(`<body><p>Les d&amp;eacute;g&amp;acirc;ts se sont accumul&eacute;s round apr&egrave;s round, jusqu'&agrave; No&euml;l.</p></body>`);
  assert.deepEqual(r.paragraphs, ["Les dégâts se sont accumulés round après round, jusqu'à Noël."]);
});
