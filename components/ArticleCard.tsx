import Link from "next/link";
import type { Article } from "@/lib/types";
import { getSport } from "@/lib/sports";
import { timeAgo } from "@/lib/data";

export default function ArticleCard({ article, large = false }: { article: Article; large?: boolean }) {
  const sport = getSport(article.sport);
  const color = sport?.color ?? "#71717a";
  return (
    <Link
      href={`/article/${article.slug}`}
      className={`card ${large ? "card-large" : ""}`}
      style={{ ["--c" as string]: color }}
    >
      <div className={`card-img ${article.image_url ? "" : "card-img-empty"}`}>
        {article.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.image_url} alt="" loading={large ? "eager" : "lazy"} />
        ) : (
          // Visuel de repli tant que l'article n'a pas de photo : initiales de la rubrique en filigrane
          <span className="card-watermark" aria-hidden="true">{sport?.short}</span>
        )}
        <span className="badge">{sport?.short}</span>
        {article.source_official && <span className="official official-card">Officiel</span>}
      </div>
      <div className="card-body">
        <h3>{article.title}</h3>
        {large && <p>{article.summary}</p>}
        <span className="meta">
          <time dateTime={article.published_at}>{timeAgo(article.published_at)}</time>
          <span aria-hidden="true"> · </span>
          via {article.source_name}
        </span>
      </div>
    </Link>
  );
}
