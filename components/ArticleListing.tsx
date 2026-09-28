import { notFound } from "next/navigation";
import ArticleCard from "@/components/ArticleCard";
import Pagination from "@/components/Pagination";
import { getPage } from "@/lib/data";
import { getSport } from "@/lib/sports";

/** Liste paginée d'une rubrique (ou de toutes les actus si `sport` est absent). */
export default async function ArticleListing({ sport: slug, page }: { sport?: string; page: number }) {
  const sport = slug ? getSport(slug) : undefined;
  if (slug && !sport) notFound();
  const { articles, totalPages } = await getPage(page, slug);
  if (page > 1 && !articles.length) notFound();

  const basePath = sport ? `/${sport.slug}` : "/actus";
  return (
    <>
      <div className="sport-banner" style={{ ["--c" as string]: sport?.color ?? "#e11d48" }}>
        <h1>{sport ? sport.name : "Toute l'actu"}</h1>
        <p>
          {sport ? sport.description : "Toutes les rubriques, de la plus récente à la plus ancienne."}
          {page > 1 && ` · Page ${page}`}
        </p>
      </div>
      {articles.length ? (
        <div className="grid">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      ) : (
        <p className="empty">Pas encore d'actualité dans cette rubrique.</p>
      )}
      <Pagination page={page} totalPages={totalPages} basePath={basePath} />
    </>
  );
}

/** Numéro de page lu dans l'adresse : entier à partir de 2 (la page 1 est l'adresse sans /page). */
export function parsePage(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 2 ? n : null;
}
