export type Sport = {
  slug: string;
  name: string;
  short: string;
  color: string;
  description: string;
};

export const SPORTS: Sport[] = [
  { slug: "mma", name: "MMA", short: "MMA", color: "#e11d48", description: "UFC, PFL, Bellator, ONE, ARES, Cage Warriors…" },
  { slug: "boxe", name: "Boxe anglaise", short: "Boxe", color: "#f59e0b", description: "Championnats du monde, boxe française et internationale." },
  { slug: "kickboxing", name: "Kickboxing", short: "Kick", color: "#8b5cf6", description: "Glory, K-1, RWS et circuits européens." },
  { slug: "muay-thai", name: "Muay thaï", short: "Muay", color: "#10b981", description: "Lumpinee, Rajadamnern, ONE Lumpinee, Thai Fight." },
  { slug: "judo", name: "Judo", short: "Judo", color: "#3b82f6", description: "Grand Chelem, Mondiaux, IJF World Tour." },
  { slug: "grappling", name: "Grappling & JJB", short: "Grappling", color: "#06b6d4", description: "ADCC, IBJJF, CJI, WNO." },
  { slug: "lutte", name: "Lutte", short: "Lutte", color: "#64748b", description: "Lutte libre, gréco-romaine, UWW." },
];

export const getSport = (slug: string) => SPORTS.find((s) => s.slug === slug);
