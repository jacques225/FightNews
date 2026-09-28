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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600&display=swap" />
      </head>
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container footer-inner">
            <div>
              <p className="logo">FIGHT<span>NEWS</span></p>
              <p>FightNews résume l'actualité et renvoie toujours vers la source d'origine.</p>
              <p>
                <Link href="/newsletter">Newsletter</Link> · <Link href="/confidentialite">Mentions légales et confidentialité</Link>
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
