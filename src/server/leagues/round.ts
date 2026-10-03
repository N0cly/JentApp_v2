import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLog, leagueMembers, leagues } from "@/db/schema";
import { isUuid, memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { postSystemMessage } from "@/server/chat/system";
import { notify as notifyPlayers } from "@/server/notifications/create";
import { notify } from "@/server/realtime/notify";
import { inLockOrder, post } from "@/server/ledger";

export const ROUND_MIN = 1;
export const ROUND_MAX = 100;
export const roundMessages = { amount: "Un nombre entier entre 1 et 100." } as const;

export type RoundResult =
  | { ok: true; members: number; created: number; alreadyPaid: boolean }
  | { ok: false; fieldErrors: { amount: string } };

/**
 * Tournée générale : le même montant pour chaque membre actif, owner
 * compris, dans une seule transaction. Réservée à l'owner. L'identifiant de
 * tournée vient de la feuille : un double envoi ne paie qu'une fois.
 */
export async function offerRound(
  actor: { id: string },
  leagueId: string,
  input: { roundId: unknown; amount: unknown },
  now: Date,
): Promise<RoundResult> {
  const amount = z.coerce.number().int().min(ROUND_MIN).max(ROUND_MAX).safeParse(input.amount);
  if (!amount.success) return { ok: false, fieldErrors: { amount: roundMessages.amount } };
  const roundId = input.roundId;
  if (typeof roundId !== "string" || !isUuid(roundId)) throw new NotFoundError();

  await memberOrNotFound(actor.id, leagueId, "owner");
  return getDb().transaction(async (tx) => {
    // Le verrou de la ligue sérialise les envois d'une même tournée.
    await tx.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)).for("update");
    const [owner] = await tx
      .select({ role: leagueMembers.role })
      .from(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, leagueId),
          eq(leagueMembers.userId, actor.id),
          isNull(leagueMembers.leftAt),
        ),
      );
    if (owner?.role !== "owner") throw new NotFoundError();

    const members = inLockOrder(
      await tx
        .select({ userId: leagueMembers.userId })
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, leagueId), isNull(leagueMembers.leftAt))),
    );

    let paid = 0;
    for (const { userId } of members) {
      const { applied } = await post(tx, {
        leagueId,
        userId,
        delta: amount.data,
        reason: "round",
        refId: roundId,
        uniqueKey: `round:${roundId}:${userId}`,
      });
      if (applied) paid += 1;
    }
    if (paid > 0) {
      await tx.insert(auditLog).values({
        leagueId,
        actorId: actor.id,
        action: "round.offered",
        details: { roundId, amount: amount.data, members: paid },
      });
      await postSystemMessage(
        tx,
        leagueId,
        { event: "round", data: { by: actor.id, amount: amount.data } },
        now,
      );
      await notifyPlayers(tx, {
        kind: "round",
        leagueId,
        actorId: actor.id,
        amount: amount.data,
      });
      // Tous les soldes bougent : le classement des autres se relit.
      await notify(tx, { league: leagueId, type: "member.changed" });
    }
    return {
      ok: true,
      members: paid,
      created: paid * amount.data,
      alreadyPaid: paid === 0,
    } as const;
  });
}
