import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticle, timeAgo } from "@/lib/data";
import { getSport } from "@/lib/sports";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle((await params).slug);
  return a ? { title: a.title, description: a.summary } : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getArticle((await params).slug);
  if (!article) notFound();
  const sport = getSport(article.sport);

  return (
    <article className="article">
      <Link href={`/${article.sport}`} className="badge" style={{ background: sport?.color }}>{sport?.name}</Link>
      <h1>{article.title}</h1>
      <p className="meta">{timeAgo(article.published_at)}</p>
      <p className="lead">{article.summary}</p>
      {article.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
      <div className="source">
        Source : <a href={article.source_url} target="_blank" rel="noopener">{article.source_name}</a>
      </div>
      {article.tags.length > 0 && (
        <div className="tags">{article.tags.map((t) => <span key={t}>#{t}</span>)}</div>
      )}
    </article>
  );
}
