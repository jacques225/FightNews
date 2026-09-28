import { Fragment } from "react";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import NewsletterForm from "@/components/NewsletterForm";
import { getLatest } from "@/lib/data";
import { SPORTS, LIFESTYLE, getSport } from "@/lib/sports";
import type { Article } from "@/lib/types";

export const revalidate = 300; // la page se régénère toutes les 5 min

export default async function Home() {
  const [articles, lifestyle] = await Promise.all([getLatest(30), getLatest(4, LIFESTYLE)]);
  const [hero, ...rest] = articles;
  const sports = SPORTS.filter((s) => s.slug !== LIFESTYLE);

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

      <p className="all-news">
        <Link href="/actus">Toute l'actu, de la plus récente à la plus ancienne →</Link>
      </p>

      <section className="nl-band">
        <div>
          <h2>Le récap de la semaine, chaque vendredi</h2>
          <p>Résultats, annonces et nouveautés lifestyle : l'essentiel en cinq minutes, dans ta boîte mail.</p>
        </div>
        <NewsletterForm />
      </section>

      {sports.map((sport, i) => (
        <Fragment key={sport.slug}>
          <SportBlock slug={sport.slug} articles={articles.filter((a) => a.sport === sport.slug).slice(0, 4)} />
          {i === 1 && <LifestyleBlock articles={lifestyle} />}
        </Fragment>
      ))}

      <p className="more-news">
        <Link href="/actus" className="btn">Voir toutes les actus</Link>
      </p>
    </>
  );
}

function SportBlock({ slug, articles }: { slug: string; articles: Article[] }) {
  const sport = getSport(slug);
  if (!sport || !articles.length) return null;
  return (
    <section className="section">
      <div className="section-head" style={{ borderColor: sport.color }}>
        <h2>{sport.name}</h2>
        <Link href={`/${sport.slug}`}>Tout voir →</Link>
      </div>
      <div className="grid">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}

function LifestyleBlock({ articles }: { articles: Article[] }) {
  if (!articles.length) return null;
  return (
    <section className="section lifestyle-block">
      <div className="lifestyle-head">
        <div>
          <span className="kicker">Collections · Équipement · Culture fight</span>
          <h2>Lifestyle</h2>
        </div>
        <Link href={`/${LIFESTYLE}`}>Tout voir →</Link>
      </div>
      <div className="grid">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}
