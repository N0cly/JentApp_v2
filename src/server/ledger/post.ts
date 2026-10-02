import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { leagueMembers, ledger } from "@/db/schema";

// Le seul code qui écrit league_members.balance (CLAUDE.md, règle 2).

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Raisons d'un mouvement. Mises, gains et remboursements portent ref_id = le pari. */
export type Reason = "join_grant" | "weekly_grant" | "round" | "wager" | "payout" | "refund";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("Solde insuffisant");
  }
}

export type Movement = {
  leagueId: string;
  userId: string;
  /** Entier non nul : positif pour un crédit, négatif pour un débit. */
  delta: number;
  reason: Reason;
  refId?: string;
  /** Crédit automatique : une seule fois par clé. */
  uniqueKey?: string;
};

export type PostResult = { applied: boolean; balance: number };

/**
 * Écrit une ligne de journal et met à jour le solde, dans la transaction de
 * l'appelant. Une clé déjà vue ne fait rien (`applied: false`). Un solde qui
 * passerait sous zéro lève InsufficientBalanceError : l'appelant laisse la
 * transaction s'annuler.
 */
export async function post(tx: Tx, movement: Movement): Promise<PostResult> {
  const { leagueId, userId, delta, reason, refId, uniqueKey } = movement;
  if (!Number.isInteger(delta) || delta === 0) throw new Error("delta doit être un entier non nul");

  const inserted = await tx
    .insert(ledger)
    .values({ leagueId, userId, delta, reason, refId, uniqueKey })
    .onConflictDoNothing({ target: ledger.uniqueKey })
    .returning({ id: ledger.id });

  const member = and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId));

  if (inserted.length === 0) {
    const [row] = await tx
      .select({ balance: leagueMembers.balance })
      .from(leagueMembers)
      .where(member);
    if (!row) throw new Error("Membre introuvable");
    return { applied: false, balance: row.balance };
  }

  // Une seule requête : elle ne touche rien si le solde passerait sous zéro.
  const [updated] = await tx
    .update(leagueMembers)
    .set({ balance: sql`${leagueMembers.balance} + ${delta}` })
    .where(and(member, sql`${leagueMembers.balance} + ${delta} >= 0`))
    .returning({ balance: leagueMembers.balance });

  if (!updated) {
    const [exists] = await tx
      .select({ balance: leagueMembers.balance })
      .from(leagueMembers)
      .where(member);
    if (!exists) throw new Error("Membre introuvable");
    throw new InsufficientBalanceError();
  }
  return { applied: true, balance: updated.balance };
}

/** Plusieurs membres : par user_id croissant, pour éviter les interblocages. */
export function inLockOrder<T extends { userId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}
