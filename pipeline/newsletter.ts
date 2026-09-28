/**
 * Récap hebdo FightNews
 * 1. prend les articles publiés ces 7 derniers jours
 * 2. envoie à chaque abonné confirmé un e-mail avec ses rubriques
 * 3. efface les inscriptions jamais confirmées et les désabonnements de plus de 30 jours
 *
 * Usage : npm run newsletter           (envoi réel)
 *         npm run newsletter:preview   (écrit newsletter-apercu.html, n'envoie rien)
 *         npm run newsletter -- --force  (reprend le récap du jour après une panne ;
 *                                        les paquets déjà partis ne sont pas renvoyés)
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ARTICLES } from "../lib/demo";
import { digestEmail, emailConfigured, sendBatch, siteUrl, type Outgoing } from "../lib/email";
import type { Article } from "../lib/types";

const PREVIEW = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const DAY = 24 * 3600_000;

const db =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

type Subscriber = { email: string; sports: string[]; token: string };

async function weekArticles(): Promise<Article[]> {
  if (!db) return DEMO_ARTICLES; // sans base : aperçu avec les articles de démo
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data as Article[];
}

async function confirmedSubscribers(): Promise<Subscriber[]> {
  const all: Subscriber[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db!
      .from("subscribers")
      .select("email, sports, token")
      .eq("status", "confirmed")
      .order("created_at")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data as Subscriber[]));
    if (data.length < 1000) return all;
  }
}

async function cleanup() {
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  const results = await Promise.all([
    db!.from("subscribers").delete().eq("status", "unsubscribed").lt("unsubscribed_at", cutoff),
    db!.from("subscribers").delete().eq("status", "pending").lt("created_at", cutoff).lt("confirmation_sent_at", cutoff),
    db!.from("subscribers").delete().eq("status", "pending").lt("created_at", cutoff).is("confirmation_sent_at", null),
  ]);
  for (const r of results) if (r.error) console.warn("Nettoyage :", r.error.message);
}

async function main() {
  const base = siteUrl();
  const articles = await weekArticles();
  if (!articles.length) {
    console.log("Aucun article publié ces 7 derniers jours : pas de récap.");
    return;
  }

  if (PREVIEW) {
    const mail = digestEmail(articles, [], base, `${base}/newsletter/desabonnement?token=apercu`)!;
    writeFileSync("newsletter-apercu.html", mail.html);
    console.log(`Aperçu écrit dans newsletter-apercu.html\nObjet : ${mail.subject}\n\n${mail.text}`);
    return;
  }
  if (!db) throw new Error("Supabase n'est pas configuré (NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY).");
  if (!emailConfigured()) throw new Error("RESEND_API_KEY ou NEWSLETTER_FROM manquante : impossible d'envoyer le récap.");
  if (!process.env.SITE_URL) throw new Error("SITE_URL manquante : les liens du récap pointeraient vers localhost.");

  // Un seul récap par jour, même si la tâche est relancée.
  const edition = new Date().toISOString().slice(0, 10);
  const { error: lockError } = await db.from("newsletter_editions").insert({ edition });
  if (lockError?.code === "23505" && !FORCE) {
    console.log(`Le récap du ${edition} est déjà parti. Après une panne, relance avec --force pour le terminer.`);
    return;
  }
  if (lockError && lockError.code !== "23505") throw lockError;

  const subscribers = await confirmedSubscribers();
  const mails: Outgoing[] = subscribers.flatMap((s) => {
    const mail = digestEmail(articles, s.sports, base, `${base}/newsletter/desabonnement?token=${s.token}`);
    if (!mail) return [];
    return [{
      to: s.email,
      ...mail,
      headers: {
        // Bouton "Se désabonner" natif de Gmail, Apple Mail, etc.
        "List-Unsubscribe": `<${base}/api/newsletter/unsubscribe?token=${s.token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }];
  });

  const sent = await sendBatch(mails, `recap-${edition}`);
  await db.from("newsletter_editions").update({ recipients: sent }).eq("edition", edition);
  console.log(`Récap du ${edition} : ${sent}/${mails.length} e-mails envoyés (${subscribers.length} abonnés confirmés).`);

  await cleanup();
  if (sent < mails.length) process.exitCode = 1; // la tâche GitHub passe en rouge pour te prévenir
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
