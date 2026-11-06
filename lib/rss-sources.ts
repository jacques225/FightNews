import sources from "../pipeline/sources.json";

/**
 * Sources affichées sur le site et dans le récap : médias francophones, plus les chaînes YouTube
 * officielles en anglais (vidéos). Même sélection que le robot (SOURCES dans pipeline/feeds.ts).
 */
export const FRENCH_PUBLISHERS = sources
  .filter((source) => source.language === "fr" || ("youtube" in source && source.language === "en"))
  .map((source) => source.name);
