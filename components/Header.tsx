import Link from "next/link";
import NavLinks from "@/components/NavLinks";

export default function Header() {
  return (
    <header className="header">
      <div className="container masthead">
        <Link href="/" className="logo" aria-label="FightNews, accueil">
          Fight<span>News</span>
        </Link>
        <Link href="/newsletter" className="nav-cta" aria-label="Recevoir le récap de la semaine">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <span>Recevoir le récap</span>
        </Link>
      </div>
      <div className="navbar">
        <div className="container">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}
