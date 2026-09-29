import type { Metadata } from "next";
import EventDate from "@/components/EventDate";
import Fighters, { TitleBadge } from "@/components/Fighters";
import { getUpcomingEvents, mainBout, monthLabel, segmentFr, shortName, weightFr, type FightEvent } from "@/lib/calendar";
import { getSport } from "@/lib/sports";

export const revalidate = 3600; // la page se régénère toutes les heures (Wikipédia est relu au plus toutes les 6 h)

export const metadata: Metadata = {
  title: "Calendrier des combats",
  description: "Les prochains galas de MMA et de kickboxing (UFC, PFL, ONE, KSW, Oktagon, Cage Warriors, Rizin, Brave CF, Glory) et leur carte.",
};

// Date du jour à Paris, au format AAAA-MM-JJ.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export default async function CalendarPage() {
  const events = await getUpcomingEvents();
  const months = new Map<string, FightEvent[]>();
  for (const e of events) {
    const m = monthLabel(e.date);
    months.set(m, [...(months.get(m) ?? []), e]);
  }

  return (
    <>
      <div className="sport-banner">
        <span className="kicker">Calendrier</span>
        <h1>Les prochains combats</h1>
        <p>Les galas annoncés par l'UFC, le PFL, ONE, le KSW, Oktagon, Cage Warriors, le Rizin, Brave CF et Glory, avec leur carte, mis à jour plusieurs fois par jour.</p>
      </div>

      {events.length ? (
        [...months].map(([month, list]) => (
          <section key={month} className="cal-month">
            <h2 className="cal-month-title">{month}</h2>
            <ol className="cal-list">
              {list.map((e) => <EventItem key={e.id} event={e} isToday={e.date === today()} />)}
            </ol>
          </section>
        ))
      ) : (
        <p className="empty">Le calendrier n'a pas pu être chargé. Réessaie dans quelques minutes.</p>
      )}

      <p className="cal-credit">
        Source : <a href="https://en.wikipedia.org/">Wikipédia en anglais</a> (listes et pages des événements, par les contributeurs
        de Wikipédia), sous licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>. Les données
        sont reprises automatiquement et traduites ; ce calendrier est diffusé sous la même licence. Les dates sont celles du pays
        de l'événement, sans les horaires, et les cartes peuvent changer jusqu'au dernier moment.
      </p>
    </>
  );
}

function EventItem({ event: e, isToday }: { event: FightEvent; isToday: boolean }) {
  const main = mainBout(e);
  const bouts = e.card.reduce((n, s) => n + s.bouts.length, 0);
  return (
    <li id={e.id} className="cal-event" style={{ ["--c" as string]: getSport(e.sport)?.color }}>
      <EventDate date={e.date} />
      <div className="cal-body">
        <p className="cal-org">
          {e.org}
          {isToday && <span className="cal-today">Aujourd'hui</span>}
        </p>
        <h3>{main ? shortName(e.name) : e.name}</h3>
        {main && <Fighters bout={main} className="cal-headline" />}
        <p className="meta">
          {[e.venue, e.location].filter(Boolean).join(" · ")}
          {(e.venue || e.location) && " · "}
          <a className="cal-source" href={e.url}>Fiche Wikipédia</a>
        </p>
      </div>
      {bouts > 0 ? (
        <details className="cal-card">
          <summary>{bouts > 1 ? `Voir les ${bouts} combats` : "Voir le combat"}</summary>
          {e.card.map((s, i) => (
            <div key={i} className="cal-segment">
              {(s.name || e.card.length > 1) && <h4>{segmentFr(s.name) || "Carte"}</h4>}
              <ul>
                {s.bouts.map((b, j) => (
                  <li key={j} className={b.done ? "cal-bout is-done" : "cal-bout"}>
                    <span className="cal-weight">
                      {weightFr(b.weight)}
                      {b.title && <TitleBadge />}
                    </span>
                    <Fighters bout={b} noBadge />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : (
        <p className="cal-pending">Carte pas encore annoncée</p>
      )}
    </li>
  );
}
