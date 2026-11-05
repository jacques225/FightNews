import { notFound } from "next/navigation";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import SourcePhoto from "@/components/SourcePhoto";
import { fullDate, getArticle, getEarlier } from "@/lib/data";
import { getSport } from "@/lib/sports";
import { youTubeId } from "@/lib/youtube";

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
  const video = youTubeId(article.source_url);

  return (
    <>
      <article className="article">
        <Link href={`/${article.sport}`} className="article-sport" style={{ ["--c" as string]: sport?.color }}>{sport?.name}</Link>
        <h1>{article.title}</h1>
        <p className="meta">Publié le {fullDate(article.published_at)}</p>
        {video ? (
          // Vidéo d'une chaîne YouTube : lecteur officiel de YouTube (mode sans cookie tant qu'on ne lance pas la vidéo).
          <div className="article-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video}`}
              title={article.title}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
            <p className="meta">
              Lecteur YouTube : <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">conditions d'utilisation</a>
              {" · "}<Link href="/confidentialite">confidentialité</Link>
            </p>
          </div>
        ) : (
          article.image_url && <SourcePhoto src={article.image_url} credit={article.source_name} eager />
        )}
        {!article.body && <p className="meta">{video ? "Vidéo de" : "Extrait de"} {article.source_name}</p>}
        {article.summary && <p className="lead">{article.summary}</p>}
        {!article.body && !article.summary && <p>Ce média ne fournit pas d'extrait pour cette actualité.</p>}
        {article.body ? (
          article.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)
        ) : (
          // Brève enregistrée sans IA : juste un extrait, l'article complet est chez son média.
          <p>
            <a className="btn" href={article.source_url} target="_blank" rel="noopener">
              {video ? "Voir la vidéo sur YouTube" : `Lire l'article complet sur ${article.source_name}`}
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
        <section className="section related" style={{ ["--c" as string]: sport?.color }} data-reveal>
          <div className="section-head">
            <h2>Précédemment en {sport?.name ?? "actu"}</h2>
            <Link href={`/${article.sport}`} className="text-link">Toutes les actus {sport?.short} →</Link>
          </div>
          <div className="grid grid-4">
            {earlier.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}
    </>
  );
}
