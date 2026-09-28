import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FightNews, l'actu de tous les sports de combat", template: "%s · FightNews" },
  description: "MMA, boxe, kickboxing, muay thaï, judo, grappling : toute l'actualité des sports de combat.",
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
        <footer className="footer container">
          <p>FightNews résume l'actualité et renvoie toujours vers la source d'origine.</p>
        </footer>
      </body>
    </html>
  );
}
