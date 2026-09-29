import Link from "next/link";
import SourcePhoto from "@/components/SourcePhoto";
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
      {/* Visuel de repli (initiales de la rubrique en filigrane) sous la photo du média :
          il reste visible tant que la photo charge, ou si elle ne s'affiche pas. */}
      <div className="card-img card-img-empty">
        <span className="card-watermark" aria-hidden="true">{sport?.short}</span>
        {article.image_url && <SourcePhoto src={article.image_url} eager={large} />}
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
