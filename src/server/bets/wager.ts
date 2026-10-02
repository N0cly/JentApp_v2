import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { betOptions, leagueMembers, wagers } from "@/db/schema";
import { isUuid } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { InsufficientBalanceError, post } from "@/server/ledger";
import { lockBet } from "./internal";
import { betMessages } from "./rules";
import { betState } from "./state";

export type WagerResult =
  { ok: true; stake: number; balance: number } | { ok: false; error: string };

/**
 * Miser : entier de 1 au solde, pari ouvert, une seule option, on ajoute sans
 * jamais réduire. L'identifiant du ticket sert de clé : un double envoi ne mise
 * qu'une fois.
 */
export async function placeWager(
  actor: { id: string },
  leagueId: string,
  betId: string,
  input: { optionId: unknown; amount: unknown; ticketId: unknown },
  now: Date,
): Promise<WagerResult> {
  const amount = z.coerce.number().int().min(1).safeParse(input.amount);
  if (!amount.success) return { ok: false, error: betMessages.amount };
  const { optionId, ticketId } = input;
  if (typeof optionId !== "string" || !isUuid(optionId)) throw new NotFoundError();
  if (typeof ticketId !== "string" || !isUuid(ticketId)) throw new NotFoundError();

  try {
    return await getDb().transaction(async (tx) => {
      const { bet } = await lockBet(tx, leagueId, betId, actor.id);
      const state = betState(bet, now);
      if (state !== "open") {
        return {
          ok: false,
          error: state === "scheduled" ? betMessages.notOpen : betMessages.closed,
        } as const;
      }
      const [option] = await tx
        .select({ id: betOptions.id })
        .from(betOptions)
        .where(and(eq(betOptions.id, optionId), eq(betOptions.betId, betId)));
      if (!option) throw new NotFoundError();

      const [existing] = await tx
        .select()
        .from(wagers)
        .where(and(eq(wagers.betId, betId), eq(wagers.userId, actor.id)));
      if (existing && existing.optionId !== optionId)
        return { ok: false, error: betMessages.otherOption } as const;

      const { applied, balance } = await post(tx, {
        leagueId,
        userId: actor.id,
        delta: -amount.data,
        reason: "wager",
        refId: betId,
        uniqueKey: `wager:${ticketId}`,
      });
      if (!applied) return { ok: true, stake: existing?.amount ?? 0, balance } as const;

      const [row] = await tx
        .insert(wagers)
        .values({
          betId,
          userId: actor.id,
          optionId,
          amount: amount.data,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [wagers.betId, wagers.userId],
          set: { amount: sql`${wagers.amount} + ${amount.data}`, updatedAt: now },
        })
        .returning({ amount: wagers.amount });
      return { ok: true, stake: row!.amount, balance } as const;
    });
  } catch (error) {
    if (!(error instanceof InsufficientBalanceError)) throw error;
    const [row] = await getDb()
      .select({ balance: leagueMembers.balance })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)));
    return { ok: false, error: betMessages.insufficient(amount.data - (row?.balance ?? 0)) };
  }
}
