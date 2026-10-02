import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { notify } from "@/server/realtime/notify";
import { getDb } from "@/db/client";
import { bets, wagers } from "@/db/schema";
import { inLockOrder, post } from "@/server/ledger";
import { postSystemMessage } from "@/server/chat/system";
import { audit, refundAll, type BetRow, type Tx } from "./internal";
import { EXPIRY_MS, settleDelayMs } from "./rules";
import { settle } from "./settle";
import { betState } from "./state";

/**
 * Versements dus de la ligue, sans tâche planifiée : appelé au chargement
 * d'une page de la ligue et avant toute action sur un pari. Verse les paris
 * dont le délai est passé et annule ceux fermés depuis 7 jours sans résultat.
 */
export async function settleDue(
  leagueId: string,
  now: Date,
): Promise<{ settled: number; expired: number }> {
  const due = await getDb()
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        eq(bets.leagueId, leagueId),
        isNotNull(bets.resolvedAt),
        isNull(bets.settledAt),
        isNull(bets.cancelledAt),
        lte(bets.resolvedAt, new Date(now.getTime() - settleDelayMs())),
      ),
    );
  const stale = await getDb()
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        eq(bets.leagueId, leagueId),
        isNull(bets.resolvedAt),
        isNull(bets.settledAt),
        isNull(bets.cancelledAt),
        lte(bets.closesAt, new Date(now.getTime() - EXPIRY_MS)),
      ),
    );

  let settled = 0;
  let expired = 0;
  for (const { id } of due) if (await settleOne(id, now)) settled += 1;
  for (const { id } of stale) if (await expireOne(id, now)) expired += 1;
  return { settled, expired };
}

async function lockFresh(tx: Tx, betId: string): Promise<BetRow | null> {
  const [bet] = await tx.select().from(bets).where(eq(bets.id, betId)).for("update");
  return bet ?? null;
}

/** Verse un pari : un mouvement par joueur, payout rempli, settled_at = now. */
async function settleOne(betId: string, now: Date): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const bet = await lockFresh(tx, betId);
    // Un autre appel a pu verser, corriger ou annuler entre-temps.
    if (!bet || betState(bet, now) !== "resolved") return false;
    if (bet.resolvedAt!.getTime() + settleDelayMs() > now.getTime()) return false;

    const stakes = await tx.select().from(wagers).where(eq(wagers.betId, betId));
    const result = settle({
      stakes: stakes.map((w) => ({
        userId: w.userId,
        optionId: w.optionId,
        amount: w.amount,
        createdAt: w.createdAt,
      })),
      winningOptionId: bet.winningOptionId!,
      seed: bet.seed,
    });

    if (result.kind === "refund") {
      await refundAll(tx, bet);
      // Rien en face : la cagnotte n'est pas versée.
      await tx.update(bets).set({ settledAt: now, seed: 0 }).where(eq(bets.id, betId));
      await notify(tx, { league: bet.leagueId, type: "bet.changed", id: betId });
      await postSystemMessage(
        tx,
        bet.leagueId,
        {
          event: "bet_settled",
          betId,
          data: { optionId: bet.winningOptionId!, oddsCents: null, refund: true },
        },
        now,
      );
      return true;
    }

    for (const { userId } of inLockOrder(stakes)) {
      const amount = result.payouts.get(userId) ?? 0;
      if (amount > 0) {
        // Un joueur parti ou supprimé reçoit sa part sur son solde gelé.
        await post(tx, {
          leagueId: bet.leagueId,
          userId,
          delta: amount,
          reason: "payout",
          refId: betId,
          uniqueKey: `payout:${betId}:${userId}`,
        });
      }
      await tx
        .update(wagers)
        .set({ payout: amount })
        .where(and(eq(wagers.betId, betId), eq(wagers.userId, userId)));
    }
    await tx.update(bets).set({ settledAt: now }).where(eq(bets.id, betId));
    await notify(tx, { league: bet.leagueId, type: "bet.changed", id: betId });
    await postSystemMessage(
      tx,
      bet.leagueId,
      {
        event: "bet_settled",
        betId,
        data: { optionId: bet.winningOptionId!, oddsCents: result.oddsCents, refund: false },
      },
      now,
    );
    return true;
  });
}

/** Fermé depuis 7 jours sans résultat : annulé et remboursé. */
async function expireOne(betId: string, now: Date): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const bet = await lockFresh(tx, betId);
    if (!bet || betState(bet, now) !== "closed") return false;
    if (bet.closesAt.getTime() + EXPIRY_MS > now.getTime()) return false;
    await refundAll(tx, bet);
    await tx
      .update(bets)
      .set({ cancelledAt: now, cancelledBy: null, cancelReason: "expired" })
      .where(eq(bets.id, betId));
    await notify(tx, { league: bet.leagueId, type: "bet.changed", id: betId });
    await audit(tx, bet.leagueId, null, "bet.cancelled", { betId, reason: "expired" });
    await postSystemMessage(
      tx,
      bet.leagueId,
      { event: "bet_cancelled", betId, data: { by: null, reason: "expired" } },
      now,
    );
    return true;
  });
}
