import Link from "next/link";
import type { Article } from "@/lib/types";
import { getSport } from "@/lib/sports";
import { timeAgo } from "@/lib/data";

export default function ArticleCard({ article, large = false }: { article: Article; large?: boolean }) {
  const sport = getSport(article.sport);
  return (
    <Link href={`/article/${article.slug}`} className={`card ${large ? "card-large" : ""}`}>
      <div
        className="card-img"
        style={{
          backgroundImage: article.image_url
            ? `url(${article.image_url})`
            : `linear-gradient(135deg, ${sport?.color ?? "#333"} 0%, #0b0b0f 90%)`,
        }}
      >
        <span className="badge" style={{ background: sport?.color }}>{sport?.short}</span>
        {article.source_official && <span className="official official-card">Officiel</span>}
      </div>
      <div className="card-body">
        <h3>{article.title}</h3>
        {large && <p>{article.summary}</p>}
        <span className="meta">{timeAgo(article.published_at)} · via {article.source_name}</span>
      </div>
    </Link>
  );
}
