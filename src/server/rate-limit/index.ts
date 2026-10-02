import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rateLimits } from "@/db/schema";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export type Rule = { name: string; limit: number; windowMs: number };

// Spec §15, plus le renvoi de l'email de confirmation (docs/M1.md).
export const rules = {
  /** Connexion : 5 échecs par quart d'heure, par email. */
  loginEmail: { name: "login:email", limit: 5, windowMs: 15 * MINUTE },
  /** Connexion : 5 échecs par quart d'heure, par adresse IP. */
  loginIp: { name: "login:ip", limit: 5, windowMs: 15 * MINUTE },
  /** Inscription : 5 comptes créés par heure, par adresse IP. */
  signUpIp: { name: "signup:ip", limit: 5, windowMs: HOUR },
  /** Réinitialisation : 3 demandes par heure, par email. */
  resetEmail: { name: "reset:email", limit: 3, windowMs: HOUR },
  /** Code d'invitation : 10 codes inconnus par heure, par compte. */
  inviteCode: { name: "invite:user", limit: 10, windowMs: HOUR },
  /** Renvoi de l'email de confirmation : 3 par heure, par compte. */
  resendVerification: { name: "verify:user", limit: 3, windowMs: HOUR },
} as const satisfies Record<string, Rule>;

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterMs: number) {
    super(rateLimitMessage(retryAfterMs));
  }
}

export function rateLimitMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE));
  return `Trop d'essais. Réessaie dans ${minutes} ${minutes > 1 ? "minutes" : "minute"}.`;
}

function key(rule: Rule, subject: string) {
  return `${rule.name}:${subject.toLowerCase()}`;
}

/** Refuse si le quota est déjà atteint, sans compter de tentative. */
export async function assertAllowed(rule: Rule, subject: string, now: Date): Promise<void> {
  const [row] = await getDb()
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key(rule, subject)));
  if (!row) return;
  const remaining = row.resetAt.getTime() - now.getTime();
  if (remaining > 0 && row.count >= rule.limit) throw new RateLimitedError(remaining);
}

/** Compte une tentative dans la fenêtre en cours, ou en ouvre une nouvelle. */
export async function record(
  rule: Rule,
  subject: string,
  now: Date,
): Promise<{ count: number; resetAt: Date }> {
  const resetAt = new Date(now.getTime() + rule.windowMs);
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key: key(rule, subject), count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= ${now.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= ${now.toISOString()}::timestamptz then ${resetAt.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });
  return row!;
}

/** Compte la tentative et refuse au-delà du quota : chaque demande compte. */
export async function consume(rule: Rule, subject: string, now: Date): Promise<void> {
  const { count, resetAt } = await record(rule, subject, now);
  if (count > rule.limit) throw new RateLimitedError(resetAt.getTime() - now.getTime());
}

/**
 * Adresse IP du client. Derrière Nginx (`TRUST_PROXY=true`), c'est la dernière
 * adresse de X-Forwarded-For, celle qu'ajoute Nginx ; les précédentes viennent
 * du client et ne sont pas fiables. Sans proxy de confiance, Next ne donne pas
 * l'adresse : toutes les requêtes partagent le même compteur.
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "true") return "local";
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "unknown";
}
