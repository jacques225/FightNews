import assert from "node:assert/strict";
import test from "node:test";
import { previewImageOf } from "./preview";

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><img src="/autre.jpg"></body></html>`;

test("la photo d'aperçu vient de la balise og:image de la page", () => {
  const html = page('<meta property="og:title" content="Titre"><meta property="og:image" content="https://media.fr/photo.jpg" />');
  assert.equal(previewImageOf(html, "https://media.fr/article"), "https://media.fr/photo.jpg");
});

test("l'ordre des attributs, une adresse relative et twitter:image sont acceptés", () => {
  assert.equal(previewImageOf(page("<meta content='/img/a.webp' property='og:image'>"), "https://media.fr/x/article"), "https://media.fr/img/a.webp");
  assert.equal(previewImageOf(page('<meta name="twitter:image" content="//cdn.media.fr/b.png">'), "https://media.fr/a"), "https://cdn.media.fr/b.png");
});

test("une version https précise passe avant l'adresse générale", () => {
  const html = page('<meta property="og:image" content="http://media.fr/p.jpg"><meta property="og:image:secure_url" content="https://cdn.media.fr/p.jpg">');
  assert.equal(previewImageOf(html, "https://media.fr/a"), "https://cdn.media.fr/p.jpg");
});

test("pas de photo d'aperçu, ou seulement le logo du site : rien", () => {
  assert.equal(previewImageOf(page("<title>Sans photo</title>"), "https://media.fr/a"), undefined);
  assert.equal(previewImageOf(page('<meta property="og:image" content="https://media.fr/wp-content/logo-site.png">'), "https://media.fr/a"), undefined);
  assert.equal(previewImageOf(page('<meta property="og:image" content="https://media.fr/uploads/tetiere_EDJ-NOIR.jpg">'), "https://media.fr/a"), undefined);
  assert.equal(previewImageOf(page('<meta property="og:image" content="javascript:alert(1)">'), "https://media.fr/a"), undefined);
});

test("les balises du corps de la page sont ignorées", () => {
  const html = '<html><head></head><body><meta property="og:image" content="https://media.fr/corps.jpg"></body></html>';
  assert.equal(previewImageOf(html, "https://media.fr/a"), undefined);
});
