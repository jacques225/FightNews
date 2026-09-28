import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { confirmationEmail, emailConfigured, sendEmail, siteUrl } from "@/lib/email";
import { SPORTS } from "@/lib/sports";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_AFTER_MS = 60 * 60 * 1000; // au plus un e-mail de confirmation par heure et par adresse
const OK = { ok: true };

export async function POST(req: Request) {
  let body: { email?: unknown; sports?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Champ piège invisible : seuls les robots le remplissent.
  if (typeof body.website === "string" && body.website !== "") return NextResponse.json(OK);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Cette adresse e-mail n'a pas l'air valide." }, { status: 400 });
  }

  // Rubriques choisies. Aucune ou toutes = tout recevoir, y compris les futures rubriques.
  const known = new Set(SPORTS.map((s) => s.slug));
  const picked = [...new Set(Array.isArray(body.sports) ? body.sports : [])].filter(
    (s): s is string => typeof s === "string" && known.has(s),
  );
  const sports = picked.length === known.size ? [] : picked;

  const db = supabaseAdmin();
  const base = siteUrl(req);

  if (!db) {
    // Mode démo : pas de base configurée, on affiche dans la console l'e-mail qui partirait.
    await sendEmail({ to: email, ...confirmationEmail(`${base}/api/newsletter/confirm?token=demo`) });
    return NextResponse.json({ ...OK, demo: true });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: "La newsletter n'est pas encore ouverte. Reviens bientôt !" }, { status: 503 });
  }

  const { data: existing, error: readError } = await db
    .from("subscribers")
    .select("status, confirmation_sent_at")
    .eq("email", email)
    .maybeSingle();
  if (readError) return serverError(readError.message);

  // Même réponse dans tous les cas, pour ne pas révéler qui est déjà abonné.
  if (existing?.status === "confirmed") return NextResponse.json(OK);
  const lastSent = existing?.confirmation_sent_at ? new Date(existing.confirmation_sent_at).getTime() : 0;
  if (existing?.status === "pending" && Date.now() - lastSent < RESEND_AFTER_MS) return NextResponse.json(OK);

  const { data: row, error: writeError } = await db
    .from("subscribers")
    .upsert({ email, sports, status: "pending", unsubscribed_at: null }, { onConflict: "email" })
    .select("token")
    .single();
  if (writeError) return serverError(writeError.message);

  const sent = await sendEmail({ to: email, ...confirmationEmail(`${base}/api/newsletter/confirm?token=${row.token}`) });
  if (!sent) {
    return NextResponse.json({ error: "L'e-mail de confirmation n'a pas pu partir. Réessaie dans quelques minutes." }, { status: 502 });
  }
  await db.from("subscribers").update({ confirmation_sent_at: new Date().toISOString() }).eq("email", email);
  return NextResponse.json(OK);
}

function serverError(detail: string) {
  console.error("Newsletter, inscription :", detail);
  return NextResponse.json({ error: "Un problème est survenu. Réessaie plus tard." }, { status: 500 });
}
