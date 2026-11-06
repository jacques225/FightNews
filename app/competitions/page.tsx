import type { Metadata } from "next";
import Link from "next/link";
import EventDate from "@/components/EventDate";
import { monthLabel } from "@/lib/calendar";
import { FILTERS, getCompetitions, OTHER_CALENDARS, SOURCES, type Competition } from "@/lib/competitions";

export const revalidate = 3600; // les sources sont relues au plus toutes les 6 h

export const metadata: Metadata = {
  title: "Compétitions",
  description: "Les opens, coupes, championnats et galas ouverts aux combattants en France : JJB, grappling, MMA amateur, karaté, kickboxing, muay thaï, sambo, lutte…",
};

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const noon = (d: string) => new Date(`${d}T12:00:00Z`);

function disciplines(c: Competition) {
  return c.disciplines.length > 4 ? "Multi-disciplines" : c.disciplines.join(", ");
}

export default async function CompetitionsPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const { competitions, failed } = await getCompetitions();
  const sports = FILTERS.filter((s) => competitions.some((c) => c.sport === s.slug));
  const current = sports.find((s) => s.slug === sport)?.slug;
  const list = current ? competitions.filter((c) => c.sport === current) : competitions;

  const months = new Map<string, Competition[]>();
  for (const c of list) {
    const m = monthLabel(c.start);
    months.set(m, [...(months.get(m) ?? []), c]);
  }

  return (
    <>
      <div className="page-head comp-head">
        <h1>Compétitions</h1>
        <p>Opens, coupes, championnats et galas en France où tu peux t'inscrire. Chaque fiche renvoie vers l'organisateur.</p>
      </div>

      <nav className="comp-filters" aria-label="Filtrer par sport">
        <Link href="/competitions" className="comp-filter" aria-current={!current ? "page" : undefined}>
          Tout <span>{competitions.length}</span>
        </Link>
        {sports.map((s) => (
          <Link
            key={s.slug}
            href={`/competitions?sport=${s.slug}`}
            className="comp-filter"
            style={{ ["--c" as string]: s.color }}
            aria-current={current === s.slug ? "page" : undefined}
          >
            {s.short} <span>{competitions.filter((c) => c.sport === s.slug).length}</span>
          </Link>
        ))}
      </nav>

      {failed.length > 0 && competitions.length > 0 && (
        <p className="comp-note">Source momentanément indisponible : {failed.join(", ")}.</p>
      )}

      {list.length ? (
        [...months].map(([month, items]) => (
          <section key={month} className="comp-month">
            <h2 className="comp-month-title">{month}</h2>
            <ol className="comp-list">
              {items.map((c) => (
                <li key={c.id} className="comp-item" style={{ ["--c" as string]: FILTERS.find((f) => f.slug === c.sport)?.color }}>
                  <EventDate date={c.start} />
                  <div className="comp-body">
                    <p className="comp-kind">
                      {c.kind}
                      {c.end !== c.start && <span> · jusqu'au {dayFmt.format(noon(c.end))}</span>}
                    </p>
                    <h3 className="comp-title">{c.title}</h3>
                    <p className="comp-meta">
                      {[c.city, disciplines(c)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <a className="comp-link" href={c.url} rel="noopener">
                    Infos et inscription
                    <small>{c.source}</small>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <p className="empty">Aucune compétition trouvée pour l'instant. Réessaie dans quelques minutes.</p>
      )}

      <aside className="comp-others">
        <h2>Autres calendriers officiels</h2>
        <p>Ces fédérations ne permettent pas de reprendre leur calendrier automatiquement. Consulte-les directement :</p>
        <ul>
          {OTHER_CALENDARS.map((o) => (
            <li key={o.url}><a href={o.url} rel="noopener">{o.name}</a></li>
          ))}
        </ul>
      </aside>

      <p className="cal-credit">
        Sources : {SOURCES.map((s, i) => (
          <span key={s.name}>{i > 0 && ", "}<a href={s.url}>{s.name}</a></span>
        ))}. Seuls le nom, la date et le lieu sont repris ; les conditions d'inscription, catégories et tarifs sont sur la
        fiche de l'organisateur. Vérifie toujours auprès de lui avant de te déplacer.
      </p>
    </>
  );
}
