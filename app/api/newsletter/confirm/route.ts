import { NextResponse } from "next/server";
import { supabaseAdmin, UUID_RE } from "@/lib/supabase-admin";
import { siteUrl } from "@/lib/email";

// Lien reçu dans l'e-mail de confirmation : /api/newsletter/confirm?token=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const done = (etat: string) => NextResponse.redirect(`${siteUrl(req)}/newsletter?etat=${etat}`, 303);

  const db = supabaseAdmin();
  if (!db) return done("demo");
  if (!UUID_RE.test(token)) return done("lien-invalide");

  const { data, error } = await db
    .from("subscribers")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("token", token)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("Newsletter, confirmation :", error.message);
    return done("erreur");
  }
  if (data.length) return done("confirme");

  // Lien déjà utilisé : on dit simplement si l'abonnement est actif.
  const { data: sub } = await db.from("subscribers").select("status").eq("token", token).maybeSingle();
  return done(sub?.status === "confirmed" ? "confirme" : "lien-invalide");
}
