import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Se désabonner", robots: { index: false } };

// Lien "Se désabonner" des e-mails. On demande un clic de confirmation pour que les
// robots anti-spam qui ouvrent les liens ne désabonnent personne par erreur.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <div className="nl-page">
      <h1>Se désabonner du récap</h1>
      <p className="lead">Tu ne recevras plus d'e-mail de FightNews. Tu pourras te réinscrire à tout moment.</p>
      <form method="post" action={`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`}>
        <button type="submit" className="btn">Confirmer le désabonnement</button>
      </form>
      <p className="nl-legal"><Link href="/">Finalement non, retour au site</Link></p>
    </div>
  );
}
