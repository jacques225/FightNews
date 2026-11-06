"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { animate, inView, scroll, stagger } from "motion";

const EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Chorégraphie des animations (bibliothèque Motion, règles du skill Taste) :
 * - un geste signature : la photo de la une s'ouvre comme un volet et se pose (échelle 1,12 → 1),
 *   puis le titre monte ;
 * - « À l'instant » arrive ligne par ligne ;
 * - plus bas, chaque section arrive à son tour : titre, puis cartes dont la photo se pose ;
 *   la rangée des combats glisse depuis la droite.
 * - défilement (exemples « parallax » et barre de progression du MCP Motion) : la photo de la une
 *   glisse un peu moins vite que la page, et une barre rouge suit la lecture d'un article.
 * Le contenu est visible par défaut : seules les sections encore sous l'écran sont masquées puis
 * révélées une fois. Sans JavaScript, ou avec « réduire les animations », rien ne bouge.
 */
export default function Reveal() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops: (() => void)[] = [];

    const lead = document.querySelector<HTMLElement>("[data-lead]");
    if (lead) {
      const frame = lead.querySelector<HTMLElement>(".card-img");
      const img = frame?.querySelector("img");
      if (frame) animate(frame, { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] }, { duration: 1.1, ease: EXPO });
      // Une fois posée, la photo rend la main au survol (CSS).
      if (img) animate(img, { transform: ["scale(1.12)", "scale(1)"] }, { duration: 1.6, ease: EXPO }).then(() => { img.style.transform = ""; });
      animate(lead.querySelectorAll(".card-body > *"), { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0)"] }, { duration: 0.9, ease: EXPO, delay: stagger(0.09, { startDelay: 0.45 }) });
    }

    // Parallaxe douce de la photo de la une, liée au défilement.
    const leadImg = lead?.querySelector<HTMLElement>(".card-img img");
    if (lead && leadImg) {
      stops.push(scroll(animate(leadImg, { translate: ["0 -6%", "0 6%"] }, { ease: "linear" }), { target: lead.querySelector(".card-img")!, offset: ["start end", "end start"] }));
    }

    // Barre de lecture sur la page article.
    const article = document.querySelector<HTMLElement>("article.article");
    if (article) {
      const bar = document.createElement("div");
      bar.className = "read-progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);
      stops.push(scroll(animate(bar, { scaleX: [0, 1] }, { ease: "linear" }), { target: article, offset: ["start start", "end end"] }));
      stops.push(() => bar.remove());
    }

    const rows = document.querySelectorAll(".latest-list li");
    if (rows.length) animate(rows, { opacity: [0, 1], transform: ["translateX(-12px)", "translateX(0)"] }, { duration: 0.6, ease: EXPO, delay: stagger(0.06, { startDelay: 0.3 }) });

    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((section) => {
      // Déjà à l'écran au chargement : on ne cache rien.
      if (section.getBoundingClientRect().top < window.innerHeight * 0.85) return;
      const sideways = section.classList.contains("upcoming");
      const head = section.querySelector<HTMLElement>(".section-head, h2");
      const items = Array.from(section.querySelectorAll<HTMLElement>("[data-reveal-item]"));
      const pics = items.map((i) => i.querySelector<HTMLElement>(".card-img img")).filter(Boolean) as HTMLElement[];
      const from = sideways ? "translateX(48px)" : "translateY(28px)";

      const hidden = head ? [head, ...items] : items;
      for (const t of hidden) { t.style.opacity = "0"; t.style.transform = from; }
      for (const p of pics) p.style.transform = "scale(1.08)";

      stops.push(
        inView(section, () => {
          if (head) animate(head, { opacity: 1, transform: "translate(0, 0)" }, { duration: 0.8, ease: EXPO });
          animate(items, { opacity: 1, transform: "translate(0, 0)" }, { duration: 0.8, ease: EXPO, delay: stagger(0.08, { startDelay: 0.12 }) });
          if (pics.length) animate(pics, { transform: "scale(1)" }, { duration: 1.3, ease: EXPO, delay: stagger(0.08, { startDelay: 0.12 }) }).then(() => pics.forEach((p) => { p.style.transform = ""; }));
        }, { amount: 0.15 }),
      );
    });

    return () => stops.forEach((s) => s());
  }, [path]);

  return null;
}
