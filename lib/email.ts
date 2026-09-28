import { Resend } from "resend";
import type { Article } from "./types";
import { SPORTS } from "./sports";

// Envoi des e-mails (Resend) et modèles de la newsletter.
// Sans RESEND_API_KEY, les e-mails sont affichés dans la console au lieu d'être envoyés.

export type Email = { subject: string; html: string; text: string };
export type Outgoing = Email & { to: string; headers?: Record<string, string> };

const FROM = process.env.NEWSLETTER_FROM || "FightNews <newsletter@example.com>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** Vrai quand la clé Resend et l'adresse d'expédition sont renseignées. */
export const emailConfigured = () => resend !== null && Boolean(process.env.NEWSLETTER_FROM);

export function siteUrl(req?: Request): string {
  const url = process.env.SITE_URL || (req ? new URL(req.url).origin : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export async function sendEmail(mail: Outgoing): Promise<boolean> {
  if (!resend) {
    logEmail(mail);
    return true;
  }
  const { error } = await resend.emails.send({ from: FROM, ...mail });
  if (error) console.error(`Resend (${mail.to}) :`, error.message);
  return !error;
}

/** Envoie par paquets de 100 (limite de Resend). Renvoie le nombre d'e-mails acceptés. */
export async function sendBatch(mails: Outgoing[], idempotencyPrefix: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    if (!resend) {
      chunk.forEach(logEmail);
      sent += chunk.length;
      continue;
    }
    // La clé d'idempotence évite un double envoi si le même paquet est relancé.
    const { data, error } = await resend.batch.send(
      chunk.map((m) => ({ from: FROM, ...m })),
      { idempotencyKey: `${idempotencyPrefix}-${i / 100}` },
    );
    if (error) console.error(`Resend, paquet ${i / 100} :`, error.message);
    else sent += data.data.length;
    await new Promise((r) => setTimeout(r, 600)); // reste sous la limite de débit
  }
  return sent;
}

function logEmail(mail: Outgoing) {
  console.log(`\n[e-mail non envoyé : RESEND_API_KEY absente]\nÀ : ${mail.to}\nObjet : ${mail.subject}\n\n${mail.text}\n`);
}

// ---------------------------------------------------------------------------
// Modèles

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout({ title, preheader, body, footer }: { title: string; preheader: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f3f5;font-family:Arial,Helvetica,sans-serif;color:#15151c">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b0b0f;padding:20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:1px">FIGHT<span style="color:#e11d48">NEWS</span></td></tr>
${body}
</table>
<p style="max-width:600px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#6b6b78">${footer}</p>
</td></tr></table>
</body></html>`;
}

function button(href: string, label: string) {
  return `<a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px">${esc(label)}</a>`;
}

export function confirmationEmail(confirmUrl: string): Email {
  const subject = "Confirme ton inscription au récap FightNews";
  const html = layout({
    title: subject,
    preheader: "Un clic pour recevoir le récap des sports de combat chaque vendredi.",
    body: `<tr><td style="padding:28px 24px">
<h1 style="margin:0 0 12px;font-size:22px">Plus qu'un clic</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6">Confirme ton adresse pour recevoir chaque vendredi le récap FightNews : MMA, boxe, kickboxing, muay thaï, judo, grappling, lutte et lifestyle.</p>
${button(confirmUrl, "Confirmer mon inscription")}
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b6b78">Tu n'as rien demandé ? Ignore cet e-mail : sans confirmation, tu ne seras pas inscrit.</p>
</td></tr>`,
    footer: "Tu reçois cet e-mail parce que cette adresse a été saisie sur FightNews.",
  });
  const text = `Confirme ton inscription au récap FightNews :\n${confirmUrl}\n\nTu n'as rien demandé ? Ignore cet e-mail : sans confirmation, tu ne seras pas inscrit.`;
  return { subject, html, text };
}

const PER_SECTION = 3;

/**
 * Récap de la semaine pour un abonné. `sports` vide = toutes les rubriques.
 * Renvoie null s'il n'y a rien à lui envoyer.
 */
export function digestEmail(articles: Article[], sports: string[], base: string, unsubscribeUrl: string): Email | null {
  const sections = SPORTS.filter((s) => sports.length === 0 || sports.includes(s.slug))
    .map((s) => ({ sport: s, items: articles.filter((a) => a.sport === s.slug).slice(0, PER_SECTION) }))
    .filter((s) => s.items.length > 0);
  if (!sections.length) return null;

  const all = sections.flatMap((s) => s.items);
  const lead = [...all].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  const subject = `Le récap FightNews : ${lead.title}`.slice(0, 120);
  const link = (a: Article) => `${base}/article/${a.slug}`;

  const body =
    `<tr><td style="padding:24px 24px 4px;font-size:16px;line-height:1.6">Salut ! Voici l'essentiel de la semaine en ${all.length} actus.</td></tr>` +
    sections
      .map(
        ({ sport, items }) =>
          `<tr><td style="padding:20px 24px 2px"><div style="border-left:4px solid ${sport.color};padding-left:10px;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${esc(sport.name)}</div></td></tr>` +
          items
            .map(
              (a) => `<tr><td style="padding:10px 24px">
<a href="${esc(link(a))}" style="color:#15151c;text-decoration:none;font-size:17px;font-weight:bold;line-height:1.35">${esc(a.title)}</a>
${a.summary ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:#4b4b57">${esc(a.summary)}</p>` : ""}
<p style="margin:4px 0 0;font-size:12px;color:#8a8a96">via ${esc(a.source_name)}${a.source_official ? " · source officielle" : ""}</p>
</td></tr>`,
            )
            .join(""),
      )
      .join("") +
    `<tr><td style="padding:24px 24px 28px">${button(base, "Toute l'actu sur FightNews")}</td></tr>`;

  const html = layout({
    title: subject,
    preheader: all.slice(0, 3).map((a) => a.title).join(" · "),
    body,
    footer: `Tu reçois ce récap parce que tu t'es inscrit sur FightNews. <a href="${esc(unsubscribeUrl)}" style="color:#6b6b78">Se désabonner</a> · <a href="${esc(base)}/confidentialite" style="color:#6b6b78">Confidentialité</a>`,
  });

  const text =
    `Le récap FightNews de la semaine\n\n` +
    sections
      .map(({ sport, items }) => `${sport.name.toUpperCase()}\n` + items.map((a) => `- ${a.title}\n${a.summary ? `  ${a.summary}\n` : ""}  ${link(a)}`).join("\n"))
      .join("\n\n") +
    `\n\nSe désabonner : ${unsubscribeUrl}`;

  return { subject, html, text };
}
