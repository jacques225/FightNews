import { NextResponse } from "next/server";
import { supabaseAdmin, UUID_RE } from "@/lib/supabase-admin";
import { siteUrl } from "@/lib/email";

// Deux façons d'arriver ici, toujours en POST (un simple clic de robot anti-spam
// sur un lien ne désabonne donc personne par erreur) :
// - le bouton de la page /newsletter/desabonnement ;
// - le bouton "Se désabonner" de Gmail ou Apple Mail (en-tête List-Unsubscribe, RFC 8058).
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  let oneClick = false;
  if ((req.headers.get("content-type") ?? "").includes("form")) {
    const form = await req.formData();
    oneClick = form.get("List-Unsubscribe") === "One-Click";
    token ||= String(form.get("token") ?? "");
  }

  let etat = "desabonne";
  const db = supabaseAdmin();
  if (!db) etat = "demo";
  else if (!UUID_RE.test(token)) etat = "lien-invalide";
  else {
    const { error } = await db
      .from("subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("token", token)
      .neq("status", "unsubscribed");
    if (error) {
      console.error("Newsletter, désabonnement :", error.message);
      etat = "erreur";
    }
  }

  if (oneClick) return new NextResponse(etat, { status: etat === "erreur" ? 500 : 200 });
  return NextResponse.redirect(`${siteUrl(req)}/newsletter?etat=${etat}`, 303);
}
