import { download, UnavailableError, type Source } from "./feeds";

// Rubrique Lifestyle : nouveautés et promotions des marques de sports de combat, lues dans le catalogue
// public de leur boutique en ligne (Shopify publie chaque catalogue en JSON à l'adresse /products.json,
// sans clé ; aucun des robots.txt des marques retenues ne l'interdit). Le robot écrit lui-même un texte
// court en français à partir des faits du catalogue (nom, coloris, prix) : rien n'est inventé ni traduit.

export type ShopProduct = {
  title: string;
  handle: string;
  body_html?: string;
  created_at: string;
  published_at?: string | null;
  updated_at?: string;
  images?: { src?: string }[];
  variants?: { price?: string; compare_at_price?: string | null; available?: boolean }[];
};

export type ShopInfo = { brand: string; currency: string; describe?: boolean };

// Un produit compte comme nouveauté s'il a été créé il y a moins de 60 jours : les marques remettent
// parfois en ligne d'anciens produits (published_at récent), ce ne sont pas des sorties.
const NEW_PRODUCT_DAYS = 60;
// En dessous de -15 %, ce n'est pas une info.
const MIN_DISCOUNT = 15;

// Shopify renvoie 250 produits au plus par page : jusqu'à 4 pages (1 000 produits) par boutique.
const MAX_PAGES = 4;

/** Catalogue d'une boutique, au format d'un flux lu par rss-parser pour que le robot le traite comme les autres. */
export async function readShop(source: Source) {
  const products: ShopProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await download(`${source.url}?limit=250&page=${page}`);
    if (res.status >= 500) throw new UnavailableError(`erreur ${res.status} du serveur de la boutique`);
    if (res.status >= 300) throw new Error(`Status code ${res.status}`);
    let batch: ShopProduct[];
    try {
      batch = (JSON.parse(res.body.toString("utf8")) as { products?: ShopProduct[] }).products ?? [];
    } catch {
      throw new Error("catalogue illisible (pas du JSON)");
    }
    products.push(...batch);
    if (batch.length < 250) break;
  }
  return { items: shopItems(products, source.url.replace(/\/products\.json$/, ""), source.shop!) };
}

// Coloris qui distinguent les déclinaisons d'un même produit (Venum, RDX… publient un produit par couleur).
const COLORS =
  "noir|noire|blanc|blanche|rouge|bleu|bleue|vert|verte|jaune|orange|marron|rose|gris|grise|or|argent|violet|kaki|beige|marine|camouflage|camo|" +
  "black|white|red|blue|green|yellow|brown|pink|grey|gray|gold|silver|purple|navy|khaki|sand|neon|néon|fluo";
const COLOR_WORD = new RegExp(`(?<![\\p{L}])(${COLORS})(?![\\p{L}])`, "giu");

/** Nom du produit sans le coloris final (« Gants Venum Giant - Noir/Or » → « Gants Venum Giant »). */
function baseName(title: string) {
  return title.replace(/\s+[-–]\s+[^-–]+$/, "").replace(/\s+/g, " ").trim();
}

/** Clé commune à toutes les déclinaisons de couleur d'un produit. */
export function modelKey(title: string) {
  return baseName(title).toLowerCase().replace(COLOR_WORD, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Coloris final d'un titre (« … - Noir/Or » → « noir/or »), s'il y en a un. */
function colorOf(title: string) {
  const m = /\s+[-–]\s+([^-–]+)$/.exec(title)?.[1].trim();
  return m && m.length <= 30 ? m.toLowerCase() : undefined;
}

/** Les catalogues en capitales (Metal Boxe, Leone) passent en minuscules, avec une capitale initiale. */
export function niceName(name: string) {
  const letters = name.replace(/[^\p{L}]/gu, "");
  const caps = letters.length > 3 && letters === letters.toUpperCase();
  const text = caps ? name.toLowerCase() : name;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value).replace(/[\u202f\u00a0]/g, " ");
}

function frenchDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

/** Premières phrases de la description du produit, sans HTML. */
export function description(html: string | undefined, max = 400) {
  const text = (html ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&rsquo;|&#39;/g, "’").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > max / 3 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

type Group = { key: string; products: ShopProduct[] };

/**
 * Une entrée par nouveauté (produit créé récemment, toutes couleurs réunies) et une par promotion d'au moins
 * -15 %. Le lien d'une promotion porte le pourcentage : la même promo n'est publiée qu'une fois, une nouvelle
 * baisse de prix fait une nouvelle info. Les dates servent au robot à ne garder que les 48 dernières heures.
 */
export function shopItems(products: ShopProduct[], base: string, shop: ShopInfo, now = Date.now()) {
  const groups = new Map<string, Group>();
  for (const p of products) {
    if (!p.title || !p.handle || !p.created_at) continue;
    const key = modelKey(p.title);
    const g = groups.get(key) ?? { key, products: [] };
    g.products.push(p);
    groups.set(key, g);
  }

  const items = [];
  for (const { products: list } of groups.values()) {
    const first = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const name = niceName(list.length > 1 ? baseName(first.title).replace(COLOR_WORD, "").replace(/\s+/g, " ").trim() : baseName(first.title));
    const brandInName = name.toLowerCase().includes(shop.brand.toLowerCase());
    const label = (kind: string) => (brandInName ? `${kind} : ${name}` : `${kind} ${shop.brand} : ${name}`);
    const link = `${base}/products/${first.handle}`;
    const image = list.map((p) => p.images?.[0]?.src).find(Boolean);
    const thumb = image ? [{ $: { url: image } }] : [];
    const colors = [...new Set(list.map((p) => colorOf(p.title)).filter(Boolean))] as string[];
    const prices = list.flatMap((p) => p.variants ?? []).map((v) => Number(v.price)).filter((n) => n > 0);
    const lowest = prices.length ? Math.min(...prices) : undefined;
    const euro = shop.currency === "EUR";

    const created = Math.min(...list.map((p) => new Date(p.created_at).getTime()));
    const published = Math.max(...list.map((p) => new Date(p.published_at ?? p.created_at).getTime()));
    if (now - created < NEW_PRODUCT_DAYS * 86400_000) {
      // Les déclinaisons sont en général des coloris, parfois des parfums ou des tailles (huile Fairtex).
      const kind = colors.every((c) => c.split(/[\s/]+/).every((w) => new RegExp(`^(${COLORS})$`, "iu").test(w))) ? "coloris" : "versions";
      const parts = [`${name} arrive sur la boutique ${shop.brand}`];
      if (colors.length > 1) parts[0] += `, en ${colors.length} ${kind} (${colors.join(kind === "coloris" ? ", " : " ; ")})`;
      else if (colors.length === 1 && kind === "coloris") parts[0] += ` (coloris ${colors[0]})`;
      let text = parts[0] + ".";
      if (euro && lowest) text += ` Prix : ${prices.length > 1 && Math.max(...prices) > lowest ? "à partir de " : ""}${money(lowest, "EUR")}.`;
      const desc = shop.describe ? description(first.body_html) : "";
      if (desc) text += ` ${desc}`;
      items.push(entry(label("Nouveauté"), link, new Date(Math.max(created, published)).toISOString(), text, thumb));
    }

    // Promotion : prix barré sur au moins une déclinaison, la plus forte remise du groupe.
    let best: { pct: number; price: number; was: number } | undefined;
    for (const v of list.flatMap((p) => p.variants ?? [])) {
      const price = Number(v.price);
      const was = Number(v.compare_at_price);
      if (!(price > 0 && was > price) || v.available === false) continue;
      const pct = Math.round(((was - price) / was) * 100);
      if (!best || pct > best.pct) best = { pct, price, was };
    }
    if (best && best.pct >= MIN_DISCOUNT) {
      const updated = Math.max(...list.map((p) => new Date(p.updated_at ?? p.created_at).getTime()));
      const date = new Date(updated).toISOString();
      const deal = euro
        ? `${niceName(name)} passe de ${money(best.was, "EUR")} à ${money(best.price, "EUR")} sur la boutique ${shop.brand} (-${best.pct} %).`
        : `${niceName(name)} est à -${best.pct} % sur la boutique en ligne de ${shop.brand}.`;
      const text = `${deal} Offre constatée le ${frenchDate(date)} : elle peut avoir pris fin depuis, et dépendre de la taille ou du coloris.`;
      items.push(entry(label(`Promo -${best.pct} %`), `${link}?promo=${best.pct}`, date, text, thumb));
    }
  }
  return items;
}

function entry(title: string, link: string, isoDate: string, text: string, thumb: { $: { url: string } }[]) {
  return {
    title,
    link,
    isoDate,
    pubDate: undefined as string | undefined,
    content: undefined as string | undefined,
    contentSnippet: text,
    "content:encoded": undefined as string | undefined,
    "content:encodedSnippet": undefined as string | undefined,
    sourceEl: undefined,
    mediaThumbnail: thumb,
  };
}
