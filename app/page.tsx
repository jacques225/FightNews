import { Fragment } from "react";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import NewsletterForm from "@/components/NewsletterForm";
import { getLatest, timeAgo } from "@/lib/data";
import { SPORTS, LIFESTYLE, getSport } from "@/lib/sports";
import type { Article } from "@/lib/types";

export const revalidate = 300; // la page se régénère toutes les 5 min

export default async function Home() {
  const [articles, lifestyle] = await Promise.all([getLatest(30), getLatest(4, LIFESTYLE)]);
  const [hero, ...rest] = articles;
  const sports = SPORTS.filter((s) => s.slug !== LIFESTYLE);

  return (
    <>
      {rest.length > 0 && <Ticker articles={rest.slice(0, 6)} />}

      {hero && (
        <section className="hero-grid" aria-label="À la une">
          <ArticleCard article={hero} large />
          <div className="latest">
            <h2 className="latest-title">
              <span className="live-dot" aria-hidden="true" />
              Les plus récentes
            </h2>
            <ol className="latest-list">
              {rest.slice(0, 5).map((a, i) => (
                <LatestItem key={a.id} article={a} rank={i + 1} />
              ))}
            </ol>
            <Link href="/actus" className="latest-more">
              Toute l'actu <Arrow />
            </Link>
          </div>
        </section>
      )}

      <nav className="sport-rail" aria-label="Accès rapide aux rubriques">
        {SPORTS.map((s) => (
          <Link key={s.slug} href={`/${s.slug}`} style={{ ["--c" as string]: s.color }}>
            <span className="sport-rail-name">{s.name}</span>
            <span className="sport-rail-desc">{s.description}</span>
          </Link>
        ))}
      </nav>

      {sports.map((sport, i) => (
        <Fragment key={sport.slug}>
          <SportBlock slug={sport.slug} articles={articles.filter((a) => a.sport === sport.slug).slice(0, 4)} />
          {i === 0 && <NewsletterBand />}
          {i === 1 && <LifestyleBlock articles={lifestyle} />}
        </Fragment>
      ))}

      <p className="more-news">
        <Link href="/actus" className="btn">Voir toutes les actus <Arrow /></Link>
      </p>
    </>
  );
}

function Arrow() {
  return (
    <svg className="arrow" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Bandeau défilant des derniers titres, sous l'en-tête. */
function Ticker({ articles }: { articles: Article[] }) {
  const items = (copy: boolean) =>
    articles.map((a) => (
      <Link
        key={a.id}
        href={`/article/${a.slug}`}
        tabIndex={copy ? -1 : undefined}
        style={{ ["--c" as string]: getSport(a.sport)?.color }}
      >
        <b>{getSport(a.sport)?.short}</b> {a.title}
      </Link>
    ));
  return (
    <div className="ticker">
      <span className="ticker-label">Dernière minute</span>
      <div className="ticker-track">
        <div className="ticker-items">
          {items(false)}
          {/* Copie pour une boucle continue, ignorée au clavier et par les lecteurs d'écran */}
          <span className="ticker-copy" aria-hidden="true">{items(true)}</span>
        </div>
      </div>
    </div>
  );
}

function LatestItem({ article, rank }: { article: Article; rank: number }) {
  const sport = getSport(article.sport);
  return (
    <li style={{ ["--c" as string]: sport?.color }}>
      <span className="latest-rank" aria-hidden="true">{String(rank).padStart(2, "0")}</span>
      <Link href={`/article/${article.slug}`}>
        <span className="latest-sport">{sport?.short}</span>
        <span className="latest-headline">{article.title}</span>
        <span className="meta">{timeAgo(article.published_at)} · via {article.source_name}</span>
      </Link>
    </li>
  );
}

function NewsletterBand() {
  return (
    <section className="nl-band">
      <div>
        <span className="kicker kicker-light">Newsletter gratuite</span>
        <h2>Le récap de la semaine, chaque vendredi</h2>
        <p>Résultats, annonces et nouveautés lifestyle : l'essentiel en cinq minutes, dans ta boîte mail.</p>
      </div>
      <NewsletterForm />
    </section>
  );
}

function SportBlock({ slug, articles }: { slug: string; articles: Article[] }) {
  const sport = getSport(slug);
  if (!sport || !articles.length) return null;
  return (
    <section className="section" style={{ ["--c" as string]: sport.color }}>
      <div className="section-head">
        <h2>{sport.name}</h2>
        <Link href={`/${sport.slug}`}>Tout voir <Arrow /></Link>
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
        <Link href={`/${LIFESTYLE}`}>Tout voir <Arrow /></Link>
      </div>
      <div className="grid">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}
