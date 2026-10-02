import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { auditLog, bets, leagueMembers, wagers } from "@/db/schema";
import type { Role } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { inLockOrder, post } from "@/server/ledger";

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type BetRow = typeof bets.$inferSelect;

export type BetAuditAction = "bet.created" | "bet.cancelled" | "bet.resolved" | "bet.corrected";

export async function audit(
  tx: Tx,
  leagueId: string,
  actorId: string | null,
  action: BetAuditAction,
  details: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({ leagueId, actorId, action, details });
}

/** Rôle actif de l'acteur dans la ligue, sinon 404. */
export async function activeRole(tx: Tx, leagueId: string, userId: string): Promise<Role> {
  const [member] = await tx
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.userId, userId),
        isNull(leagueMembers.leftAt),
      ),
    );
  if (!member) throw new NotFoundError();
  return member.role;
}

/**
 * Verrouille un pari de la ligue et vérifie que l'acteur en est membre. Un
 * pari d'une autre ligue répond comme un pari inconnu : 404.
 */
export async function lockBet(tx: Tx, leagueId: string, betId: string, actorId: string) {
  const role = await activeRole(tx, leagueId, actorId);
  const [bet] = await tx
    .select()
    .from(bets)
    .where(and(eq(bets.id, betId), eq(bets.leagueId, leagueId)))
    .for("update");
  if (!bet) throw new NotFoundError();
  return { bet, role };
}

/** Rend chaque mise sur le solde (gelé compris), payout = mise. Par user_id croissant. */
export async function refundAll(tx: Tx, bet: BetRow) {
  const rows = inLockOrder(
    await tx
      .select({ userId: wagers.userId, amount: wagers.amount })
      .from(wagers)
      .where(eq(wagers.betId, bet.id)),
  );
  for (const w of rows) {
    await post(tx, {
      leagueId: bet.leagueId,
      userId: w.userId,
      delta: w.amount,
      reason: "refund",
      refId: bet.id,
      uniqueKey: `refund:${bet.id}:${w.userId}`,
    });
    await tx
      .update(wagers)
      .set({ payout: w.amount })
      .where(and(eq(wagers.betId, bet.id), eq(wagers.userId, w.userId)));
  }
}
