import sources from "../pipeline/sources.json";

/**
 * Sources affichées sur le site et dans le récap : médias francophones, plus les chaînes YouTube
 * officielles en anglais (vidéos) et les boutiques des marques (texte écrit en français par le robot). Même sélection que le robot (SOURCES dans pipeline/feeds.ts).
 */
export const FRENCH_PUBLISHERS = sources
  .filter((source) => source.language === "fr" || (("youtube" in source || "shop" in source) && source.language === "en"))
  .map((source) => source.name);
