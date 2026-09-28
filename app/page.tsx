import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import { getLatest } from "@/lib/data";
import { SPORTS } from "@/lib/sports";

export const revalidate = 300; // la page se régénère toutes les 5 min

export default async function Home() {
  const articles = await getLatest(30);
  const [hero, ...rest] = articles;

  return (
    <>
      {hero && (
        <section className="hero-grid">
          <ArticleCard article={hero} large />
          <div className="stack">
            {rest.slice(0, 3).map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}

      {SPORTS.map((sport) => {
        const list = articles.filter((a) => a.sport === sport.slug).slice(0, 4);
        if (!list.length) return null;
        return (
          <section key={sport.slug} className="section">
            <div className="section-head" style={{ borderColor: sport.color }}>
              <h2>{sport.name}</h2>
              <Link href={`/${sport.slug}`}>Tout voir →</Link>
            </div>
            <div className="grid">
              {list.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}
