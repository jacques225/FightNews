import Link from "next/link";
import SourcePhoto from "@/components/SourcePhoto";
import type { Article } from "@/lib/types";
import { getSport } from "@/lib/sports";
import { displayTitle, timeAgo } from "@/lib/data";

type Variant = "default" | "large" | "compact" | "feature";

export default function ArticleCard({ article, large = false, variant }: { article: Article; large?: boolean; variant?: Variant }) {
  const sport = getSport(article.sport);
  const v: Variant = variant ?? (large ? "large" : "default");
  return (
    <Link
      href={`/article/${article.slug}`}
      className={`card card-${v}`}
      style={{ ["--c" as string]: sport?.color ?? "#71717a" }}
      data-reveal-item=""
      {...(v === "large" ? { "data-lead": "" } : {})}
    >
      {/* Visuel de repli (nom de la rubrique sur un aplat de sa couleur) sous la photo du média :
          il reste visible tant que la photo charge, ou si elle ne s'affiche pas. */}
      <div className="card-img">
        <span className="card-fallback" aria-hidden="true">{sport?.short}</span>
        {article.image_url && <SourcePhoto src={article.image_url} eager={v === "large"} />}
      </div>
      <div className="card-body">
        {v === "large" ? <h2 className="card-title">{displayTitle(article.title)}</h2> : <h3 className="card-title">{displayTitle(article.title)}</h3>}
        {(v === "large" || v === "feature") && article.summary && <p className="card-excerpt">{article.summary}</p>}
        <p className="meta">
          <span className="meta-sport">{sport?.short}</span>
          <time dateTime={article.published_at}>{timeAgo(article.published_at)}</time>
          <span>{article.source_name}</span>
          {article.source_official && <span className="official">Source officielle</span>}
        </p>
      </div>
    </Link>
  );
}
