import { and, count, eq, gt, gte, isNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { betOptions, bets, leagues, wagers } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { weekStart } from "@/lib/week";
import { audit, lockBet, refundAll, type BetRow, type Tx } from "./internal";
import { betMessages, settleDelayMs } from "./rules";
import { betState } from "./state";

export const MAX_SEEDED_PER_WEEK = 5;

/** `optionId` désigne le gagnant ; `cancel` annule et rend les mises (égalité, indécidable). */
export type ResultChoice = { optionId: string } | { cancel: true };

export type ResultOutcome = { ok: true } | { ok: false; error: string };

/**
 * Cagnotte, sous verrou sur la ligue : seed_amount de l'instant si au moins
 * 3 joueurs, 2 options misées, quelqu'un sur la gagnante, et moins de 5 autres
 * paris dotés qui ferment la même semaine (heure de Paris). Sinon 0.
 */
async function decideSeed(tx: Tx, bet: BetRow, winningOptionId: string): Promise<number> {
  const [league] = await tx
    .select({ seedAmount: leagues.seedAmount })
    .from(leagues)
    .where(eq(leagues.id, bet.leagueId))
    .for("update");
  if (!league || league.seedAmount <= 0) return 0;

  const stakes = await tx
    .select({ userId: wagers.userId, optionId: wagers.optionId })
    .from(wagers)
    .where(eq(wagers.betId, bet.id));
  if (new Set(stakes.map((s) => s.userId)).size < 3) return 0;
  if (new Set(stakes.map((s) => s.optionId)).size < 2) return 0;
  if (!stakes.some((s) => s.optionId === winningOptionId)) return 0;

  const start = weekStart(bet.closesAt);
  const end = weekStart(new Date(start.getTime() + 8 * 24 * 3600_000));
  const [seeded] = await tx
    .select({ n: count() })
    .from(bets)
    .where(
      and(
        eq(bets.leagueId, bet.leagueId),
        ne(bets.id, bet.id),
        isNull(bets.cancelledAt),
        gt(bets.seed, 0),
        gte(bets.closesAt, start),
        lt(bets.closesAt, end),
      ),
    );
  return (seeded?.n ?? 0) < MAX_SEEDED_PER_WEEK ? league.seedAmount : 0;
}

async function cancelForTie(tx: Tx, bet: BetRow, actorId: string, now: Date) {
  await refundAll(tx, bet);
  await tx
    .update(bets)
    .set({ cancelledAt: now, cancelledBy: actorId, cancelReason: "tie" })
    .where(eq(bets.id, bet.id));
  await audit(tx, bet.leagueId, actorId, "bet.cancelled", { betId: bet.id, reason: "tie" });
}

async function applyResult(tx: Tx, bet: BetRow, actorId: string, optionId: string, now: Date) {
  const [option] = await tx
    .select({ id: betOptions.id })
    .from(betOptions)
    .where(and(eq(betOptions.id, optionId), eq(betOptions.betId, bet.id)));
  if (!option) throw new NotFoundError();
  const seed = await decideSeed(tx, bet, optionId);
  await tx
    .update(bets)
    .set({ winningOptionId: optionId, resolvedAt: now, resolvedBy: actorId, seed })
    .where(eq(bets.id, bet.id));
}

/** Saisir : le créateur, un admin ou l'owner, une fois le pari fermé. */
export async function resolveBet(
  actor: { id: string },
  leagueId: string,
  betId: string,
  choice: ResultChoice,
  now: Date,
): Promise<ResultOutcome> {
  return getDb().transaction(async (tx) => {
    const { bet, role } = await lockBet(tx, leagueId, betId, actor.id);
    if (bet.createdBy !== actor.id && role === "player") throw new NotFoundError();
    const state = betState(bet, now);
    if (state === "scheduled" || state === "open")
      return { ok: false, error: betMessages.notClosed } as const;
    if (state !== "closed") throw new NotFoundError();

    if ("cancel" in choice) {
      await cancelForTie(tx, bet, actor.id, now);
      return { ok: true } as const;
    }
    await applyResult(tx, bet, actor.id, choice.optionId, now);
    await audit(tx, leagueId, actor.id, "bet.resolved", { betId, optionId: choice.optionId });
    return { ok: true } as const;
  });
}

/**
 * Corriger : celui qui a saisi, un admin ou l'owner, tant que le délai court.
 * La correction relance le délai et redécide la cagnotte.
 */
export async function correctResult(
  actor: { id: string },
  leagueId: string,
  betId: string,
  choice: ResultChoice,
  now: Date,
): Promise<ResultOutcome> {
  return getDb().transaction(async (tx) => {
    const { bet, role } = await lockBet(tx, leagueId, betId, actor.id);
    if (bet.resolvedBy !== actor.id && role === "player") throw new NotFoundError();
    const state = betState(bet, now);
    if (state === "settled") return { ok: false, error: betMessages.tooLateToCorrect } as const;
    if (state !== "resolved") throw new NotFoundError();
    if (now.getTime() >= bet.resolvedAt!.getTime() + settleDelayMs()) {
      return { ok: false, error: betMessages.tooLateToCorrect } as const;
    }

    if ("cancel" in choice) {
      await cancelForTie(tx, bet, actor.id, now);
      return { ok: true } as const;
    }
    await applyResult(tx, bet, actor.id, choice.optionId, now);
    await audit(tx, leagueId, actor.id, "bet.corrected", { betId, optionId: choice.optionId });
    return { ok: true } as const;
  });
}
