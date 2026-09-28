import type { Article } from "./types";

// Données fictives affichées tant que Supabase n'est pas configuré,
// pour voir le design sans rien brancher.
const now = Date.now();
const h = (n: number) => new Date(now - n * 3600_000).toISOString();

export const DEMO_ARTICLES: Article[] = [
  { id: "1", slug: "demo-mma-main-event", sport: "mma", title: "Main event confirmé : le champion défendra sa ceinture en décembre", summary: "L'organisation a officialisé le combat principal de sa dernière carte de l'année, avec un challenger invaincu en face.", body: "", tags: ["UFC", "titre"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(1), status: "published" },
  { id: "2", slug: "demo-boxe-unification", sport: "boxe", title: "Boxe : vers une unification des ceintures chez les lourds-légers", summary: "Les deux camps auraient trouvé un accord de principe pour un combat au printemps.", body: "", tags: ["lourds-légers"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(3), status: "published" },
  { id: "3", slug: "demo-muay-lumpinee", sport: "muay-thai", title: "Muay thaï : un Français s'impose au stade Lumpinee", summary: "Victoire aux points après cinq rounds disputés, une première pour son club.", body: "", tags: ["Lumpinee", "France"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(5), status: "published" },
  { id: "4", slug: "demo-judo-grand-chelem", sport: "judo", title: "Judo : bilan de l'équipe de France au Grand Chelem", summary: "Trois médailles dont une en or pour les Bleus ce week-end.", body: "", tags: ["IJF", "Grand Chelem"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(8), status: "published" },
  { id: "5", slug: "demo-kick-glory", sport: "kickboxing", title: "Kickboxing : la prochaine carte Glory dévoilée", summary: "Un tournoi à huit en poids lourds sera au programme.", body: "", tags: ["Glory"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(12), status: "published" },
  { id: "6", slug: "demo-grappling-adcc", sport: "grappling", title: "Grappling : les qualifications ADCC européennes approchent", summary: "Les inscriptions ouvrent pour les trials de la zone Europe.", body: "", tags: ["ADCC"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(20), status: "published" },
  { id: "7", slug: "demo-mma-pfl", sport: "mma", title: "PFL : les finalistes de la saison sont connus", summary: "Récapitulatif des demi-finales et des affiches de la finale.", body: "", tags: ["PFL"], image_url: null, source_name: "Exemple Source", source_url: "https://example.com", published_at: h(26), status: "published" },
].map((a) => ({ ...a, body: `Ceci est un article de démonstration. Une fois le pipeline branché, ce texte sera un résumé original rédigé par l'IA à partir de la source citée plus bas.`, status: "published" as const }));
