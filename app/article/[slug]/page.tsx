import { notFound } from "next/navigation";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import { fullDate, getArticle, getEarlier } from "@/lib/data";
import { getSport } from "@/lib/sports";

export const revalidate = 300;

// Chaque article reste en ligne : sa page est générée à la première visite, puis gardée en cache.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle((await params).slug);
  return a ? { title: a.title, description: a.summary || undefined } : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getArticle((await params).slug);
  if (!article) notFound();
  const sport = getSport(article.sport);
  const earlier = await getEarlier(article);

  return (
    <>
      <article className="article">
        <Link href={`/${article.sport}`} className="badge" style={{ background: sport?.color }}>{sport?.name}</Link>
        <h1>{article.title}</h1>
        <p className="meta">Publié le {fullDate(article.published_at)}</p>
        {article.summary && <p className="lead">{article.summary}</p>}
        {article.body ? (
          article.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)
        ) : (
          // Brève enregistrée sans IA : juste un extrait, l'article complet est chez son média.
          <p>
            <a className="btn" href={article.source_url} target="_blank" rel="noopener">
              Lire l'article complet sur {article.source_name}
            </a>
          </p>
        )}
        <div className="source">
          Source : <a href={article.source_url} target="_blank" rel="noopener">{article.source_name}</a>
          {article.source_official && <span className="official">Source officielle</span>}
        </div>
        {article.tags.length > 0 && (
          <div className="tags">{article.tags.map((t) => <span key={t}>#{t}</span>)}</div>
        )}
      </article>

      {earlier.length > 0 && (
        <section className="section related">
          <div className="section-head" style={{ borderColor: sport?.color }}>
            <h2>Précédemment en {sport?.name ?? "actu"}</h2>
            <Link href={`/${article.sport}`}>Toutes les actus {sport?.short} →</Link>
          </div>
          <div className="grid">
            {earlier.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}
    </>
  );
}
