import { createClient } from "@supabase/supabase-js";
import type { Article } from "./types";
import { FRENCH_PUBLISHERS } from "./rss-sources";
import { DEMO_ARTICLES } from "./demo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

export const PER_PAGE = 24;

const demo = (sport?: string) =>
  DEMO_ARTICLES.filter((a) => !sport || a.sport === sport).sort((a, b) => b.published_at.localeCompare(a.published_at));

export async function getLatest(limit = 30, sport?: string): Promise<Article[]> {
  if (!supabase) return demo(sport).slice(0, limit);
  let q = supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .in("source_name", FRENCH_PUBLISHERS)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sport) q = q.eq("sport", sport);
  const { data, error } = await q;
  if (error) throw error;
  return data as Article[];
}

export type ArticlePage = { articles: Article[]; page: number; totalPages: number };

/** Une page d'archives (24 articles), du plus récent au plus ancien. Page vide si elle n'existe pas. */
export async function getPage(page: number, sport?: string): Promise<ArticlePage> {
  const from = (page - 1) * PER_PAGE;
  if (!supabase) {
    const all = demo(sport);
    return { articles: all.slice(from, from + PER_PAGE), page, totalPages: Math.max(1, Math.ceil(all.length / PER_PAGE)) };
  }
  let q = supabase
    .from("articles")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .in("source_name", FRENCH_PUBLISHERS)
    .order("published_at", { ascending: false })
    .range(from, from + PER_PAGE - 1);
  if (sport) q = q.eq("sport", sport);
  const { data, count, error } = await q;
  if (error?.code === "PGRST103") return { articles: [], page, totalPages: 0 }; // page au-delà de la dernière
  if (error) throw error;
  return { articles: data as Article[], page, totalPages: Math.max(1, Math.ceil((count ?? 0) / PER_PAGE)) };
}

export async function getArticle(slug: string): Promise<Article | null> {
  if (!supabase) return DEMO_ARTICLES.find((a) => a.slug === slug) ?? null;
  const { data } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as Article) ?? null;
}

/** Les articles précédents de la même rubrique, pour "À lire aussi". */
export async function getEarlier(article: Article, limit = 4): Promise<Article[]> {
  if (!supabase) return demo(article.sport).filter((a) => a.published_at < article.published_at).slice(0, limit);
  const { data } = await supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .in("source_name", FRENCH_PUBLISHERS)
    .eq("sport", article.sport)
    .lt("published_at", article.published_at)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Article[];
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

/** "il y a 5 min", "il y a 3 h", "il y a 2 j", puis la date au-delà d'une semaine. */
export function timeAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return `le ${dateFmt.format(new Date(iso))}`;
}

/** "28 septembre 2026 à 21:10" */
export const fullDate = (iso: string) => longFmt.format(new Date(iso));
