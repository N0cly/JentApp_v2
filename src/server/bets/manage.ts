import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { betOptions, bets, leagueMembers, wagers } from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { postSystemMessage } from "@/server/chat/system";
import { activeRole, audit, lockBet, refundAll, type Tx } from "./internal";
import { betMessages, PLAYER_BET_CAP, validateBet, type BetField } from "./rules";
import { betState } from "./state";

export type BetFailure = {
  ok: false;
  fieldErrors?: Partial<Record<BetField, string>>;
  formError?: string;
};

async function insertOptions(tx: Tx, betId: string, options: string[]) {
  await tx
    .insert(betOptions)
    .values(options.map((label, position) => ({ betId, label, position })));
}

/** Paris d'un joueur ni réglés ni annulés. */
async function openBetsOf(tx: Tx, leagueId: string, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(bets)
    .where(
      and(
        eq(bets.leagueId, leagueId),
        eq(bets.createdBy, userId),
        isNull(bets.settledAt),
        isNull(bets.cancelledAt),
      ),
    );
  return row?.n ?? 0;
}

/** Tout membre actif crée un pari ; un joueur en a 3 au plus en cours. */
export async function createBet(
  actor: { id: string },
  leagueId: string,
  input: unknown,
  now: Date,
): Promise<{ ok: true; betId: string } | BetFailure> {
  await memberOrNotFound(actor.id, leagueId);
  const valid = validateBet(input, now);
  if (!valid.ok) return valid;
  const { options, ...bet } = valid.bet;

  return getDb().transaction(async (tx) => {
    // Verrou sur l'adhésion : deux créations simultanées ne dépassent pas le plafond.
    await tx
      .select({ role: leagueMembers.role })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)))
      .for("update");
    const role = await activeRole(tx, leagueId, actor.id);
    if (role === "player" && (await openBetsOf(tx, leagueId, actor.id)) >= PLAYER_BET_CAP) {
      return { ok: false, formError: betMessages.cap } as const;
    }
    const [row] = await tx
      .insert(bets)
      .values({ ...bet, leagueId, createdBy: actor.id, createdAt: now })
      .returning({ id: bets.id });
    await insertOptions(tx, row!.id, options);
    await audit(tx, leagueId, actor.id, "bet.created", { betId: row!.id });
    await postSystemMessage(
      tx,
      leagueId,
      { event: "bet_opened", betId: row!.id, data: { by: actor.id } },
      now,
    );
    return { ok: true, betId: row!.id } as const;
  });
}

/** Le créateur modifie son pari tant que personne n'a misé et qu'il n'est pas fermé. */
export async function updateBet(
  actor: { id: string },
  leagueId: string,
  betId: string,
  input: unknown,
  now: Date,
): Promise<{ ok: true } | BetFailure> {
  return getDb().transaction(async (tx) => {
    const { bet } = await lockBet(tx, leagueId, betId, actor.id);
    if (bet.createdBy !== actor.id) throw new NotFoundError();
    const state = betState(bet, now);
    if (state !== "scheduled" && state !== "open")
      return { ok: false, formError: betMessages.closed } as const;
    const [staked] = await tx.select({ n: count() }).from(wagers).where(eq(wagers.betId, betId));
    if ((staked?.n ?? 0) > 0) return { ok: false, formError: betMessages.locked } as const;

    const valid = validateBet(input, now, bet.createdAt);
    if (!valid.ok) return valid;
    const { options, ...fields } = valid.bet;
    // Une ouverture déjà passée reste celle d'origine.
    const opensAt = state === "open" ? bet.opensAt : fields.opensAt;
    await tx
      .update(bets)
      .set({ ...fields, opensAt })
      .where(eq(bets.id, betId));
    await tx.delete(betOptions).where(eq(betOptions.betId, betId));
    await insertOptions(tx, betId, options);
    return { ok: true } as const;
  });
}

/**
 * Annuler : le créateur avant la fermeture, un admin ou l'owner tant que le
 * pari n'est pas réglé. Toutes les mises sont rendues dans la transaction.
 */
export async function cancelBet(
  actor: { id: string },
  leagueId: string,
  betId: string,
  now: Date,
): Promise<{ ok: true } | BetFailure> {
  return getDb().transaction(async (tx) => {
    const { bet, role } = await lockBet(tx, leagueId, betId, actor.id);
    const state = betState(bet, now);
    if (state === "settled" || state === "cancelled") throw new NotFoundError();
    const manager = role === "admin" || role === "owner";
    const creatorInTime = bet.createdBy === actor.id && (state === "scheduled" || state === "open");
    if (!manager && !creatorInTime) throw new NotFoundError();

    // Son propre pari avant la fermeture : « creator » ; sinon un admin ou l'owner.
    const reason = creatorInTime ? "creator" : "admin";
    await refundAll(tx, bet);
    await tx
      .update(bets)
      .set({ cancelledAt: now, cancelledBy: actor.id, cancelReason: reason })
      .where(eq(bets.id, betId));
    await audit(tx, leagueId, actor.id, "bet.cancelled", { betId, reason });
    await postSystemMessage(
      tx,
      leagueId,
      { event: "bet_cancelled", betId, data: { by: actor.id, reason } },
      now,
    );
    return { ok: true } as const;
  });
}

/** Options d'un ensemble de paris, dans l'ordre. */
export async function optionsOf(betIds: string[]) {
  if (betIds.length === 0) return [];
  return getDb()
    .select()
    .from(betOptions)
    .where(inArray(betOptions.betId, betIds))
    .orderBy(betOptions.betId, betOptions.position);
}
