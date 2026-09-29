import sources from "../pipeline/sources.json";

/** Médias francophones autorisés pour les nouvelles listes publiques et le récap. */
export const FRENCH_PUBLISHERS = sources.filter((source) => source.language === "fr").map((source) => source.name);
