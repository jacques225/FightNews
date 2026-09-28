import Link from "next/link";
import NavLinks from "@/components/NavLinks";

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="FightNews, accueil">
          <span className="logo-mark" aria-hidden="true">FN</span>
          FIGHT<span>NEWS</span>
        </Link>
        <NavLinks />
        <Link href="/newsletter" className="nav-cta">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          Newsletter
        </Link>
      </div>
    </header>
  );
}
