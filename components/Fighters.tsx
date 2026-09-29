import type { Bout } from "@/lib/wikitext";

/** « A vs B », ou « A bat B » quand le combat vient d'avoir lieu ; badge si un titre est en jeu (sauf `noBadge`). */
export default function Fighters({ bout: b, className = "cal-fighters", noBadge = false }: { bout: Bout; className?: string; noBadge?: boolean }) {
  return (
    <p className={className}>
      {b.done ? (
        <>
          <strong>{b.a}</strong> <i>bat</i> {b.b}
        </>
      ) : (
        <>
          {b.a} <i>vs</i> {b.b}
        </>
      )}
      {b.title && !noBadge && <TitleBadge />}
    </p>
  );
}

export const TitleBadge = () => <span className="cal-title">Titre</span>;
