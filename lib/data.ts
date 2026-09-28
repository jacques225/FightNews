import { createClient } from "@supabase/supabase-js";
import type { Article } from "./types";
import { DEMO_ARTICLES } from "./demo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

export async function getLatest(limit = 30, sport?: string): Promise<Article[]> {
  if (!supabase) {
    return DEMO_ARTICLES.filter((a) => !sport || a.sport === sport)
      .sort((a, b) => b.published_at.localeCompare(a.published_at))
      .slice(0, limit);
  }
  let q = supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sport) q = q.eq("sport", sport);
  const { data, error } = await q;
  if (error) throw error;
  return data as Article[];
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

export function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
