import Link from "next/link";
import { SPORTS } from "@/lib/sports";

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo">FIGHT<span>NEWS</span></Link>
        <nav className="nav">
          {SPORTS.map((s) => (
            <Link key={s.slug} href={`/${s.slug}`} style={{ ["--c" as string]: s.color }}>{s.short}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
