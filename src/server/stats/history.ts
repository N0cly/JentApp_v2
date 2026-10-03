// Historique des mises d'un membre dans une ligue (docs/M5.md, § Historique).

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { betOptions, bets, wagers } from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { betState } from "@/server/bets/state";
import { settleDelayMs } from "@/server/bets/rules";
import { isRefund } from "@/server/bets/settle";
import { settledTotals } from "./stakes";

export const HISTORY_PAGE_SIZE = 20;

export type CancelReason = "cancelled" | "tie" | "expired";

export type HistoryOutcome =
  | { kind: "open"; closesAt: Date }
  | { kind: "closed" }
  | { kind: "resolved"; settlesAt: Date }
  | { kind: "won"; net: number }
  | { kind: "lost"; net: number }
  | { kind: "refunded" }
  | { kind: "cancelled"; reason: CancelReason };

export type HistoryItem = {
  betId: string;
  question: string;
  option: string;
  amount: number;
  outcome: HistoryOutcome;
};

type Options = { settledOnly: boolean; limit: number; offset: number };

/** Les terminés (réglés ou annulés) après les autres. */
const ended = sql`(${bets.settledAt} is not null or ${bets.cancelledAt} is not null)`;

async function historyRows(leagueId: string, userId: string, now: Date, options: Options) {
  const totals = settledTotals(leagueId);
  const rows = await getDb()
    .select({
      betId: bets.id,
      question: bets.question,
      option: betOptions.label,
      amount: wagers.amount,
      payout: wagers.payout,
      optionId: wagers.optionId,
      winningOptionId: bets.winningOptionId,
      opensAt: bets.opensAt,
      closesAt: bets.closesAt,
      resolvedAt: bets.resolvedAt,
      settledAt: bets.settledAt,
      cancelledAt: bets.cancelledAt,
      cancelReason: bets.cancelReason,
      total: totals.total,
      winning: totals.winning,
    })
    .from(wagers)
    .innerJoin(bets, eq(bets.id, wagers.betId))
    .innerJoin(betOptions, eq(betOptions.id, wagers.optionId))
    .leftJoin(totals, eq(totals.betId, wagers.betId))
    .where(
      and(
        eq(bets.leagueId, leagueId),
        eq(wagers.userId, userId),
        options.settledOnly ? and(isNotNull(bets.settledAt), isNull(bets.cancelledAt)) : undefined,
      ),
    )
    .orderBy(
      asc(ended),
      // Non terminés : fermeture la plus proche d'abord.
      asc(sql`case when not ${ended} then ${bets.closesAt} end`),
      // Terminés : du plus récent au plus ancien.
      desc(sql`coalesce(${bets.settledAt}, ${bets.cancelledAt})`),
      asc(bets.id),
    )
    .limit(options.limit)
    .offset(options.offset);

  return rows.map((r): HistoryItem => {
    const state = betState(r, now);
    let outcome: HistoryOutcome;
    if (state === "cancelled") {
      const reason =
        r.cancelReason === "tie" || r.cancelReason === "expired" ? r.cancelReason : "cancelled";
      outcome = { kind: "cancelled", reason };
    } else if (state === "settled") {
      if (isRefund(r.winning ?? 0, r.total ?? 0)) outcome = { kind: "refunded" };
      else if (r.optionId === r.winningOptionId) {
        outcome = { kind: "won", net: (r.payout ?? 0) - r.amount };
      } else outcome = { kind: "lost", net: -r.amount };
    } else if (state === "resolved") {
      outcome = {
        kind: "resolved",
        settlesAt: new Date(r.resolvedAt!.getTime() + settleDelayMs()),
      };
    } else if (state === "closed") outcome = { kind: "closed" };
    else outcome = { kind: "open", closesAt: r.closesAt };
    return { betId: r.betId, question: r.question, option: r.option, amount: r.amount, outcome };
  });
}

/**
 * Mes mises dans la ligue, tous états confondus, 20 par page (`page` à partir
 * de 0). Sans contrôle d'accès : à l'appelant de le faire.
 */
export async function memberHistory(
  leagueId: string,
  userId: string,
  page: number,
  now: Date,
): Promise<{ items: HistoryItem[]; hasMore: boolean }> {
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const rows = await historyRows(leagueId, userId, now, {
    settledOnly: false,
    limit: HISTORY_PAGE_SIZE + 1,
    offset: safePage * HISTORY_PAGE_SIZE,
  });
  return { items: rows.slice(0, HISTORY_PAGE_SIZE), hasMore: rows.length > HISTORY_PAGE_SIZE };
}

/** Derniers paris réglés d'un membre, du plus récent au plus ancien. */
export async function lastSettled(
  leagueId: string,
  userId: string,
  limit: number,
  now: Date,
): Promise<HistoryItem[]> {
  return historyRows(leagueId, userId, now, { settledOnly: true, limit, offset: 0 });
}

/** Mon historique, lu par un membre actif ; sinon 404. */
export async function getMyHistory(
  actor: { id: string },
  leagueId: string,
  page: number,
  now: Date,
): Promise<{ items: HistoryItem[]; hasMore: boolean }> {
  await memberOrNotFound(actor.id, leagueId);
  return memberHistory(leagueId, actor.id, page, now);
}
