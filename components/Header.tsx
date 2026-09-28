import Link from "next/link";
import { SPORTS, LIFESTYLE } from "@/lib/sports";

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo">FIGHT<span>NEWS</span></Link>
        <nav className="nav">
          {SPORTS.map((s) => (
            <Link
              key={s.slug}
              href={`/${s.slug}`}
              className={s.slug === LIFESTYLE ? "nav-lifestyle" : undefined}
              style={{ ["--c" as string]: s.color }}
            >
              {s.short}
            </Link>
          ))}
        </nav>
        <Link href="/newsletter" className="nav-cta">Newsletter</Link>
      </div>
    </header>
  );
}
