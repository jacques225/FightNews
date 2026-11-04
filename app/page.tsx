import { Fragment } from "react";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import EventDate from "@/components/EventDate";
import Fighters from "@/components/Fighters";
import NewsletterForm from "@/components/NewsletterForm";
import { getUpcomingEvents, mainBout, shortName, type FightEvent } from "@/lib/calendar";
import { getLatest, timeAgo } from "@/lib/data";
import { SPORTS, LIFESTYLE, getSport } from "@/lib/sports";
import type { Article } from "@/lib/types";

export const revalidate = 300; // la page se régénère toutes les 5 min

export default async function Home() {
  const sports = SPORTS.filter((s) => s.slug !== LIFESTYLE);
  // Les dernières actus, puis 5 par rubrique pour que chaque bloc soit plein.
  const [articles, lifestyle, events, ...bySport] = await Promise.all([
    getLatest(12),
    getLatest(4, LIFESTYLE),
    getUpcomingEvents(),
    ...sports.map((s) => getLatest(5, s.slug)),
  ]);
  const [hero, ...rest] = articles;

  return (
    <>
      {hero && (
        <section className="front" aria-labelledby="front-title">
          <h1 id="front-title" className="sr-only">FightNews, l'actu de tous les sports de combat</h1>
          <ArticleCard article={hero} large />
          <div className="latest">
            <h2 className="latest-title">
              <span className="live-dot" aria-hidden="true" />
              À l'instant
            </h2>
            <ul className="latest-list">
              {rest.slice(0, 6).map((a) => <LatestItem key={a.id} article={a} />)}
            </ul>
            <Link href="/actus" className="text-link">
              Toute l'actu <Arrow />
            </Link>
          </div>
        </section>
      )}

      <UpcomingBlock events={events.slice(0, 4)} />

      {sports.map((sport, i) => (
        <Fragment key={sport.slug}>
          <SportBlock
            slug={sport.slug}
            alt={i % 2 === 1}
            // La une n'est pas répétée dans le bloc de sa rubrique.
            articles={bySport[i].filter((a) => a.id !== hero?.id).slice(0, 4)}
          />
          {i === 0 && <NewsletterBand />}
          {i === 1 && <LifestyleBlock articles={lifestyle} />}
        </Fragment>
      ))}

      <p className="more-news">
        <Link href="/actus" className="btn btn-ghost">Voir toutes les actus <Arrow /></Link>
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

function LatestItem({ article }: { article: Article }) {
  const sport = getSport(article.sport);
  return (
    <li style={{ ["--c" as string]: sport?.color }}>
      <Link href={`/article/${article.slug}`}>
        <span className="latest-headline">{article.title}</span>
        <span className="meta">
          <span className="meta-sport">{sport?.short}</span>
          <span>{timeAgo(article.published_at)}</span>
          <span>{article.source_name}</span>
        </span>
      </Link>
    </li>
  );
}

function NewsletterBand() {
  return (
    <section className="nl-band" data-reveal>
      <div data-reveal-item>
        <h2>Le récap de la semaine, chaque vendredi</h2>
        <p>Résultats, annonces et nouveautés lifestyle : l'essentiel des sports de combat en cinq minutes, gratuit.</p>
      </div>
      <div data-reveal-item>
        <NewsletterForm />
      </div>
    </section>
  );
}

/** Les prochains galas, vers le calendrier complet. */
function UpcomingBlock({ events }: { events: FightEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="section upcoming" data-reveal>
      <div className="section-head">
        <h2>Prochains combats</h2>
        <Link href="/calendrier" className="text-link">Tout le calendrier <Arrow /></Link>
      </div>
      <ol className="cal-strip">
        {events.map((e) => {
          const main = mainBout(e);
          return (
            <li key={e.id} style={{ ["--c" as string]: getSport(e.sport)?.color }} data-reveal-item>
              <Link href={`/calendrier#${e.id}`}>
                <EventDate date={e.date} />
                <div className="cal-body">
                  <span className="cal-org">{e.org}</span>
                  <span className="cal-name">{main ? shortName(e.name) : e.name}</span>
                  {main ? <Fighters bout={main} className="cal-headline" /> : <span className="meta">{e.location}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SportBlock({ slug, articles, alt }: { slug: string; articles: Article[]; alt: boolean }) {
  const sport = getSport(slug);
  if (!sport || !articles.length) return null;
  const [lead, ...others] = articles;
  return (
    <section className={`section sport-block ${alt ? "sport-block-alt" : ""}`} style={{ ["--c" as string]: sport.color }} data-reveal>
      <div className="section-head">
        <h2>
          <Link href={`/${sport.slug}`}>{sport.name}</Link>
        </h2>
        <Link href={`/${sport.slug}`} className="text-link">Toute la rubrique <Arrow /></Link>
      </div>
      {articles.length === 1 ? (
        <div className="sport-solo">
          <ArticleCard article={lead} variant="feature" />
        </div>
      ) : alt && articles.length === 4 ? (
        <div className="grid grid-4">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      ) : (
        <div className="sport-split">
          <ArticleCard article={lead} variant="feature" />
          {others.length > 0 && (
            <div className="sport-list">
              {others.map((a) => <ArticleCard key={a.id} article={a} variant="compact" />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LifestyleBlock({ articles }: { articles: Article[] }) {
  if (!articles.length) return null;
  return (
    <section className="section lifestyle-block" style={{ ["--c" as string]: getSport(LIFESTYLE)?.color }} data-reveal>
      <div className="section-head">
        <h2>
          <Link href={`/${LIFESTYLE}`}>Lifestyle</Link>
        </h2>
        <Link href={`/${LIFESTYLE}`} className="text-link">Collections, équipement, culture fight <Arrow /></Link>
      </div>
      <div className="grid grid-4">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}
