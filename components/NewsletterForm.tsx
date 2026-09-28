"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { SPORTS } from "@/lib/sports";

type State = "idle" | "sending" | "done" | "error";

export default function NewsletterForm({ withSports = false }: { withSports?: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [sports, setSports] = useState<string[]>(SPORTS.map((s) => s.slug));
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  const toggle = (slug: string) =>
    setSports((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const website = String(new FormData(e.currentTarget).get("website") ?? "");
    if (withSports && sports.length === 0) {
      setState("error");
      setMessage("Choisis au moins une rubrique.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sports: withSports ? sports : [], website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error && err.message ? err.message : "Impossible de t'inscrire pour l'instant. Réessaie plus tard.");
    }
  }

  if (state === "done") {
    return (
      <p className="nl-done" role="status">
        Presque fini : ouvre l'e-mail qu'on vient de t'envoyer et clique sur le lien pour confirmer.
      </p>
    );
  }

  return (
    <form className="nl-form" onSubmit={submit}>
      {withSports && (
        <fieldset className="nl-sports">
          <legend>Tes rubriques</legend>
          {SPORTS.map((s) => (
            <label key={s.slug} className="chip" style={{ ["--c" as string]: s.color }}>
              <input type="checkbox" checked={sports.includes(s.slug)} onChange={() => toggle(s.slug)} />
              <span>{s.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="nl-row">
        <label htmlFor={`${id}-email`} className="sr-only">Adresse e-mail</label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          placeholder="ton@email.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Envoi…" : "S'abonner"}
        </button>
      </div>
      {/* Champ piège : invisible pour les humains, rempli par les robots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <p className="nl-legal">
        Un e-mail par semaine, désabonnement en un clic. <Link href="/confidentialite">Confidentialité</Link>
      </p>
      {state === "error" && <p className="nl-error" role="alert">{message}</p>}
    </form>
  );
}
