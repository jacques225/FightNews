/**
 * Photo d'aperçu d'un article, pour les médias qui n'en mettent pas dans leur flux RSS (ex. La Sueur).
 *
 * Quand on partage un lien sur Facebook, WhatsApp ou X, une image apparaît : c'est la photo que le média
 * a choisie lui-même pour représenter son article, annoncée dans l'en-tête de sa page (balises
 * « og:image » ou « twitter:image »). On reprend cette adresse, comme pour la photo du flux : elle reste
 * affichée depuis le serveur du média, avec son nom en crédit, et n'est jamais copiée chez nous.
 *
 * Le robot ne lit que la page de l'article déjà cité, une fois, et seulement si le robots.txt du site
 * le permet.
 */
import { decode, download, photoUrl } from "./feeds";
import { robotsForbids } from "./robots";

// Balises lues, de la plus précise à la plus générale.
const KEYS = ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"];
// Images génériques qu'un site met quand l'article n'a pas de photo : logo, image par défaut, têtière du site.
// Les « bannières » restent acceptées : la FFBoxe en crée une par article (ex. Banniere-FFBoxe-7.png).
const GENERIC = /logo|favicon|default|placeholder|share-image|social-share|t[eé]ti[eè]re/i;

/** Adresse de la photo d'aperçu trouvée dans le HTML d'une page, ou rien. Fonction pure, testable. */
export function previewImageOf(html: string, pageUrl: string): string | undefined {
  // Les balises d'aperçu sont dans l'en-tête : inutile de lire le reste de la page.
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)) || 200_000);
  const found = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && KEYS.includes(key) && !found.has(key)) found.set(key, content);
  }
  for (const key of KEYS) {
    const raw = found.get(key);
    if (!raw) continue;
    let absolute: string;
    try {
      absolute = new URL(raw.trim(), pageUrl).toString(); // une adresse relative devient complète
    } catch {
      continue;
    }
    const url = photoUrl(absolute);
    if (url && !GENERIC.test(new URL(url).pathname)) return url;
  }
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

/**
 * Cherche la photo d'aperçu de la page d'un article. Renvoie l'adresse, ou null si la page n'en a pas
 * (ou si le site interdit aux robots de la lire). Lance une erreur si le site ne répond pas :
 * on réessaiera au passage suivant.
 */
export async function previewImage(pageUrl: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(pageUrl)) return null;
  if (await robotsForbids(pageUrl)) return null;
  const res = await download(pageUrl);
  if (res.status >= 500) throw new Error(`erreur ${res.status} du serveur du site`);
  if (res.status >= 300) return null;
  return previewImageOf(decode(res.body, res.contentType), pageUrl) ?? null;
}
