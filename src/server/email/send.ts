import nodemailer, { type Transporter } from "nodemailer";
import type { EmailContent } from "./templates";

export type SentEmail = EmailContent & { to: string; from: string };

/** Emails envoyés pendant les tests : rien ne sort de la machine. */
export const outbox: SentEmail[] = [];

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST manquant");
  const user = process.env.SMTP_USER;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    // En local, Mailpit n'a pas d'identifiants.
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transporter;
}

export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "JentApp <no-reply@localhost>";
  if (process.env.VITEST) {
    outbox.push({ to, from, ...content });
    return;
  }
  await getTransporter().sendMail({ from, to, ...content });
}
