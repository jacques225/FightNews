import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mentions légales et confidentialité" };

// À compléter avant la mise en ligne : tout ce qui est entre crochets.
export default function PrivacyPage() {
  return (
    <article className="article legal">
      <h1>Mentions légales et confidentialité</h1>

      <h2>Éditeur du site</h2>
      <p>[Ton nom ou le nom de ta structure], [adresse], [e-mail de contact].</p>
      <p>Hébergement : [nom, adresse et téléphone de l'hébergeur, par exemple Vercel].</p>

      <h2>Contenus</h2>
      <p>
        FightNews affiche les titres et de courts extraits des flux RSS de médias francophones, avec un lien vers la source.
        Les marques et contenus cités appartiennent à leurs propriétaires.
      </p>

      <h2>Vidéos YouTube</h2>
      <p>
        FightNews utilise les services d'API de YouTube (YouTube API Services) pour lister les dernières vidéos de chaînes
        françaises de sports de combat : titre, début de la description et miniature, avec un lien vers la vidéo. Ces données
        sont remises à jour au moins chaque semaine, et retirées quand la vidéo est supprimée ou rendue privée.
        L'API est appelée par notre robot, jamais avec tes données : FightNews ne te demande aucun accès à ton compte Google.
      </p>
      <p>
        Sur la page d'une vidéo, le lecteur est fourni par YouTube depuis youtube-nocookie.com. En l'affichant ou en lançant
        la vidéo, YouTube (Google) peut recevoir des informations techniques comme ton adresse IP et ton navigateur.
        En regardant ces vidéos, tu acceptes les{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">conditions d'utilisation de YouTube</a>.
        Voir aussi les{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">règles de confidentialité de Google</a>.
      </p>

      <h2>Newsletter et données personnelles</h2>
      <p>
        <strong>Données :</strong> ton adresse e-mail, les rubriques choisies et les dates d'inscription, de confirmation
        et de désabonnement. Rien d'autre.
      </p>
      <p>
        <strong>Usage :</strong> uniquement l'envoi du récap FightNews. Ton adresse n'est ni vendue ni partagée.
        Base légale : ton consentement, donné en confirmant ton inscription.
      </p>
      <p>
        <strong>Durée :</strong> tant que tu es abonné. Une inscription non confirmée ou un désabonnement est effacé
        au bout de 30 jours environ.
      </p>
      <p>
        <strong>Prestataires :</strong> Supabase (base de données), Resend (envoi des e-mails), Vercel (hébergement du site), YouTube (lecteur des vidéos).
      </p>
      <p>
        <strong>Tes droits :</strong> tu peux te désabonner à tout moment grâce au lien présent dans chaque e-mail, et
        demander l'accès à tes données ou leur suppression à [e-mail de contact]. Tu peux aussi saisir la CNIL (cnil.fr).
      </p>
    </article>
  );
}
