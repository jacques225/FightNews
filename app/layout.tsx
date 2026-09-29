import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import NewsletterForm from "@/components/NewsletterForm";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FightNews, l'actu de tous les sports de combat", template: "%s · FightNews" },
  description: "MMA, boxe, kickboxing, muay thaï, judo, grappling et lifestyle : toute l'actualité des sports de combat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Barlow:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container footer-inner">
            <div>
              <p className="logo">FIGHT<span>NEWS</span></p>
              <p>Les titres et extraits de l'actualité des sports de combat, avec leurs sources.</p>
              <p>
                <Link href="/actus">Toute l'actu</Link> · <Link href="/calendrier">Calendrier</Link> ·{" "}
                <Link href="/newsletter">Newsletter</Link> ·{" "}
                <Link href="/confidentialite">Mentions légales et confidentialité</Link>
              </p>
            </div>
            <div>
              <p className="footer-title">Le récap chaque vendredi</p>
              <NewsletterForm />
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
