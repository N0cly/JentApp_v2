import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bets, wagers } from "@/db/schema";
import { isRefund } from "@/server/bets/settle";
import type { Tx } from "@/server/ledger";

/** La base, ou la transaction en cours (un versement voit son propre pari). */
export type Executor = ReturnType<typeof getDb> | Tx;

/**
 * Totaux de chaque pari réglé de la ligue : pot hors cagnotte et total misé
 * sur l'option gagnante. Un pari annulé n'a pas de `settled_at`.
 */
export function settledTotals(leagueId: string, db: Executor = getDb()) {
  return db
    .select({
      betId: wagers.betId,
      total: sql<number>`sum(${wagers.amount})::int`.as("total"),
      winning:
        sql<number>`coalesce(sum(${wagers.amount}) filter (where ${wagers.optionId} = ${bets.winningOptionId}), 0)::int`.as(
          "winning",
        ),
    })
    .from(wagers)
    .innerJoin(bets, eq(bets.id, wagers.betId))
    .where(and(eq(bets.leagueId, leagueId), isNotNull(bets.settledAt), isNull(bets.cancelledAt)))
    .groupBy(wagers.betId)
    .as("totals");
}

/** Mise d'un joueur sur un pari réglé, avec les totaux du pari. */
export type SettledStake = {
  userId: string;
  betId: string;
  settledAt: Date;
  amount: number;
  payout: number;
  won: boolean;
  refund: boolean;
};

/** Mises de la ligue (ou d'un joueur) sur des paris réglés, remboursements repérés au pari. */
export async function settledStakes(
  leagueId: string,
  userId?: string,
  db: Executor = getDb(),
): Promise<SettledStake[]> {
  const totals = settledTotals(leagueId, db);
  const rows = await db
    .select({
      userId: wagers.userId,
      betId: wagers.betId,
      settledAt: bets.settledAt,
      amount: wagers.amount,
      payout: wagers.payout,
      won: sql<boolean>`${wagers.optionId} = ${bets.winningOptionId}`,
      total: totals.total,
      winning: totals.winning,
    })
    .from(wagers)
    .innerJoin(totals, eq(totals.betId, wagers.betId))
    .innerJoin(bets, eq(bets.id, wagers.betId))
    .where(userId ? eq(wagers.userId, userId) : undefined);
  return rows.map((r) => ({
    userId: r.userId,
    betId: r.betId,
    settledAt: r.settledAt!,
    amount: r.amount,
    payout: r.payout ?? 0,
    won: r.won,
    refund: isRefund(r.winning, r.total),
  }));
}
