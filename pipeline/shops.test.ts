import assert from "node:assert/strict";
import test from "node:test";
import { modelKey, niceName, shopItems, type ShopProduct } from "./shops";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const product = (p: Partial<ShopProduct> & { title: string }): ShopProduct => ({
  handle: p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  created_at: "2026-11-05T10:00:00+01:00",
  published_at: "2026-11-05T10:00:00+01:00",
  updated_at: "2026-11-05T10:00:00+01:00",
  images: [{ src: `https://cdn.shopify.com/${p.title.length}.jpg` }],
  variants: [{ price: "89.99", compare_at_price: null }],
  ...p,
});

test("les coloris d'un même produit ne font qu'une nouveauté", () => {
  const items = shopItems(
    [product({ title: "Gants de boxe Venum Giant 3.0 - Noir/Or" }), product({ title: "Gants de boxe Venum Giant 3.0 - Rouge", created_at: "2026-11-05T11:00:00+01:00" })],
    "https://fr.venum.com",
    { brand: "Venum", currency: "EUR" },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Nouveauté : Gants de boxe Venum Giant 3.0");
  assert.equal(items[0].link, "https://fr.venum.com/products/gants-de-boxe-venum-giant-3-0-noir-or");
  assert.match(items[0].contentSnippet, /arrive sur la boutique Venum, en 2 coloris \(noir\/or, rouge\)\. Prix : 89,99 €\./);
});

test("un ancien produit remis en ligne n'est pas une nouveauté", () => {
  const items = shopItems([product({ title: "Poignées pour pompes", created_at: "2021-07-27T05:47:56+02:00" })], "https://x", { brand: "Venum", currency: "EUR" }, NOW);
  assert.equal(items.length, 0);
});

test("une remise d'au moins 15 % devient une promo, avec le pourcentage dans le lien", () => {
  const items = shopItems(
    [
      product({ title: "PATTES D'OURS LEGACY", created_at: "2025-01-01T00:00:00Z", variants: [{ price: "20.00", compare_at_price: "40.00" }] }),
      product({ title: "Bandes", created_at: "2025-01-01T00:00:00Z", variants: [{ price: "9.00", compare_at_price: "10.00" }] }),
    ],
    "https://www.metal-boxe.com",
    { brand: "Metal Boxe", currency: "EUR" },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Promo -50 % Metal Boxe : Pattes d'ours legacy");
  assert.equal(items[0].link, "https://www.metal-boxe.com/products/pattes-d-ours-legacy?promo=50");
  assert.match(items[0].contentSnippet, /passe de 40,00 € à 20,00 € sur la boutique Metal Boxe \(-50 %\)\. Offre constatée le 5 novembre 2026/);
});

test("boutique en dollars : la remise sans prix", () => {
  const [item] = shopItems(
    [product({ title: "Training Shorts", created_at: "2025-01-01T00:00:00Z", variants: [{ price: "30", compare_at_price: "60" }] })],
    "https://hayabusafight.com",
    { brand: "Hayabusa", currency: "USD" },
    NOW,
  );
  assert.equal(item.contentSnippet.startsWith("Training Shorts est à -50 % sur la boutique en ligne de Hayabusa."), true);
  assert.doesNotMatch(item.contentSnippet, /\$/);
});

test("clé de modèle et noms en capitales", () => {
  assert.equal(modelKey("RDX T15 Nero Marron Pads De Boxe"), modelKey("RDX T15 Nero orange Pads De Boxe"));
  assert.notEqual(modelKey("Gants Venum Giant"), modelKey("Short Venum Giant"));
  assert.equal(niceName("URBAN FIGHTER BOXING GLOVES"), "Urban fighter boxing gloves");
  assert.equal(niceName("Gants RDX F15"), "Gants RDX F15");
});
