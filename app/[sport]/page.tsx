import { notFound } from "next/navigation";
import ArticleCard from "@/components/ArticleCard";
import { getLatest } from "@/lib/data";
import { SPORTS, getSport } from "@/lib/sports";

export const revalidate = 300;

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }) {
  const sport = getSport((await params).sport);
  return { title: sport ? `Actu ${sport.name}` : "Section" };
}

export default async function SportPage({ params }: { params: Promise<{ sport: string }> }) {
  const sport = getSport((await params).sport);
  if (!sport) notFound();
  const articles = await getLatest(40, sport.slug);

  return (
    <>
      <div className="sport-banner" style={{ ["--c" as string]: sport.color }}>
        <h1>{sport.name}</h1>
        <p>{sport.description}</p>
      </div>
      {articles.length ? (
        <div className="grid">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      ) : (
        <p className="empty">Pas encore d'actualité dans cette section.</p>
      )}
    </>
  );
}
