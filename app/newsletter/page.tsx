import type { Metadata } from "next";
import NewsletterForm from "@/components/NewsletterForm";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Le récap FightNews chaque vendredi : l'essentiel des sports de combat dans ta boîte mail.",
};

const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  confirme: { tone: "ok", text: "C'est confirmé ! Ton premier récap arrive vendredi." },
  desabonne: { tone: "ok", text: "Tu es désabonné. Tu peux te réinscrire quand tu veux." },
  "lien-invalide": { tone: "warn", text: "Ce lien n'est plus valable. Tu peux te réinscrire ci-dessous." },
  erreur: { tone: "warn", text: "Un problème est survenu. Réessaie dans quelques minutes." },
  demo: { tone: "warn", text: "Mode démo : la base de données n'est pas encore branchée, rien n'a été enregistré." },
};

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  const { etat } = await searchParams;
  const notice = etat ? MESSAGES[etat] : undefined;

  return (
    <div className="nl-page">
      {notice && <p className={`notice notice-${notice.tone}`} role="status">{notice.text}</p>}
      <span className="kicker">Newsletter gratuite</span>
      <h1>Le récap FightNews, chaque vendredi</h1>
      <p className="lead">
        Les résultats, les annonces de combats et les nouveautés lifestyle de la semaine, triés par rubrique.
        Tu choisis ce que tu veux recevoir.
      </p>
      <NewsletterForm withSports />
    </div>
  );
}
