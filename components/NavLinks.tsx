"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SPORTS, LIFESTYLE } from "@/lib/sports";

/** Menu des rubriques, avec la rubrique en cours soulignée à sa couleur. */
export default function NavLinks() {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <nav className="nav" aria-label="Rubriques">
      <Link href="/actus" className="nav-all" aria-current={isActive("/actus") ? "page" : undefined}>
        Toute l'actu
      </Link>
      {SPORTS.map((s) => (
        <Link
          key={s.slug}
          href={`/${s.slug}`}
          className={s.slug === LIFESTYLE ? "nav-lifestyle" : undefined}
          style={{ ["--c" as string]: s.color }}
          aria-current={isActive(`/${s.slug}`) ? "page" : undefined}
        >
          {s.short}
        </Link>
      ))}
    </nav>
  );
}
