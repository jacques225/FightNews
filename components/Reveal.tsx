"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { animate, inView, stagger } from "motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Animations d'entrée (bibliothèque Motion). Le contenu est visible par défaut : seules les sections
 * encore sous l'écran sont masquées puis révélées quand on y arrive. Sans JavaScript, ou pour qui
 * demande moins d'animations, rien ne bouge et tout reste lisible.
 */
export default function Reveal() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops: (() => void)[] = [];

    // Signature : la photo de la une se dévoile de bas en haut, le titre suit.
    const lead = document.querySelector<HTMLElement>("[data-lead]");
    if (lead) {
      const img = lead.querySelector(".card-img");
      if (img) animate(img, { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] }, { duration: 0.9, ease: EASE });
      const text = lead.querySelectorAll(".card-body > *");
      animate(text, { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0)"] }, { duration: 0.7, ease: EASE, delay: stagger(0.08, { startDelay: 0.35 }) });
    }

    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((section) => {
      const items = section.querySelectorAll<HTMLElement>("[data-reveal-item]");
      const targets = items.length ? Array.from(items) : [section];
      // Déjà à l'écran au chargement : on ne cache rien.
      if (section.getBoundingClientRect().top < window.innerHeight * 0.9) {
        animate(targets, { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] }, { duration: 0.6, ease: EASE, delay: stagger(0.06, { startDelay: 0.2 }) });
        return;
      }
      for (const t of targets) { t.style.opacity = "0"; t.style.transform = "translateY(28px)"; }
      stops.push(
        inView(section, () => {
          animate(targets, { opacity: 1, transform: "translateY(0)" }, { duration: 0.7, ease: EASE, delay: stagger(0.07) });
        }, { amount: 0.15 }),
      );
    });

    return () => stops.forEach((s) => s());
  }, [path]);

  return null;
}
