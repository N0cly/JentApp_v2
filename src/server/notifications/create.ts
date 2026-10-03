// Création des notifications (docs/M7.md, § Notifications), dans la
// transaction de l'événement : annulé, pas de notification.

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { bets, leagueMembers, notifications, users, wagers } from "@/db/schema";
import type { Tx } from "@/server/ledger";
import { notify as signal } from "@/server/realtime/notify";
import type { NotificationPayload } from "@/lib/notification-text";

export type NotifyEvent =
  | { kind: "bet_opened"; leagueId: string; betId: string; actorId: string; now: Date }
  | {
      kind: "bet_resolved";
      leagueId: string;
      betId: string;
      actorId: string;
      option: string;
      delayMinutes: number;
      correction: boolean;
    }
  | { kind: "bet_settled"; leagueId: string; betId: string; refund: boolean }
  | { kind: "bet_cancelled"; leagueId: string; betId: string; actorId: string | null }
  | { kind: "mention"; leagueId: string; messageId: number; authorId: string; userIds: string[] }
  | { kind: "round"; leagueId: string; actorId: string; amount: number };

/** Ce qu'exige chaque type : `all`, ou `results_mentions` (que `all` reçoit aussi). */
const needsAll: Record<NotifyEvent["kind"], boolean> = {
  bet_opened: true,
  round: true,
  bet_resolved: false,
  bet_settled: false,
  bet_cancelled: false,
  mention: false,
};

type Recipient = { userId: string; payload: NotificationPayload };

function levelAllows(kind: NotifyEvent["kind"]) {
  return needsAll[kind]
    ? eq(leagueMembers.notifyLevel, "all")
    : inArray(leagueMembers.notifyLevel, ["all", "results_mentions"]);
}

/** Membres actifs de la ligue au bon niveau, sauf l'auteur. */
async function members(tx: Tx, event: NotifyEvent, exclude: string | null, among?: string[]) {
  if (among && among.length === 0) return [];
  const rows = await tx
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, event.leagueId),
        isNull(leagueMembers.leftAt),
        levelAllows(event.kind),
        exclude ? ne(leagueMembers.userId, exclude) : undefined,
        among ? inArray(leagueMembers.userId, among) : undefined,
      ),
    );
  return rows.map((r) => r.userId);
}

/** Parieurs actifs du pari, au bon niveau, sauf l'auteur, avec leur mise. */
async function bettors(tx: Tx, event: NotifyEvent & { betId: string }, exclude: string | null) {
  return tx
    .select({
      userId: wagers.userId,
      optionId: wagers.optionId,
      amount: wagers.amount,
      payout: wagers.payout,
    })
    .from(wagers)
    .innerJoin(
      leagueMembers,
      and(eq(leagueMembers.userId, wagers.userId), eq(leagueMembers.leagueId, event.leagueId)),
    )
    .where(
      and(
        eq(wagers.betId, event.betId),
        isNull(leagueMembers.leftAt),
        levelAllows(event.kind),
        exclude ? ne(wagers.userId, exclude) : undefined,
      ),
    );
}

async function betOf(tx: Tx, betId: string) {
  const [bet] = await tx.select().from(bets).where(eq(bets.id, betId));
  if (!bet) throw new Error("Pari introuvable");
  return bet;
}

async function recipientsOf(tx: Tx, event: NotifyEvent): Promise<Recipient[]> {
  switch (event.kind) {
    case "bet_opened": {
      const bet = await betOf(tx, event.betId);
      const scheduled = bet.opensAt > event.now;
      // Pari mystère pas encore ouvert : ni question ni options.
      const payload: NotificationPayload = {
        type: "bet_opened",
        betId: bet.id,
        question: scheduled && bet.hiddenUntilOpen ? null : bet.question,
        opensAt: scheduled ? bet.opensAt.toISOString() : null,
      };
      return (await members(tx, event, event.actorId)).map((userId) => ({ userId, payload }));
    }
    case "bet_resolved": {
      const bet = await betOf(tx, event.betId);
      const payload: NotificationPayload = {
        type: "bet_resolved",
        betId: bet.id,
        question: bet.question,
        option: event.option,
        delayMinutes: event.delayMinutes,
        correction: event.correction,
      };
      return (await bettors(tx, event, event.actorId)).map((w) => ({ userId: w.userId, payload }));
    }
    case "bet_settled": {
      const bet = await betOf(tx, event.betId);
      return (await bettors(tx, event, null)).map((w) => {
        const won = !event.refund && w.optionId === bet.winningOptionId;
        return {
          userId: w.userId,
          payload: {
            type: "bet_settled",
            betId: bet.id,
            question: bet.question,
            outcome: event.refund ? "refunded" : won ? "won" : "lost",
            amount: event.refund ? w.amount : won ? (w.payout ?? 0) - w.amount : w.amount,
          },
        };
      });
    }
    case "bet_cancelled": {
      const bet = await betOf(tx, event.betId);
      return (await bettors(tx, event, event.actorId)).map((w) => ({
        userId: w.userId,
        payload: { type: "bet_cancelled", betId: bet.id, question: bet.question, amount: w.amount },
      }));
    }
    case "mention": {
      const [author] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, event.authorId));
      const payload: NotificationPayload = {
        type: "mention",
        messageId: event.messageId,
        author: author?.name ?? "",
      };
      return (await members(tx, event, event.authorId, event.userIds)).map((userId) => ({
        userId,
        payload,
      }));
    }
    case "round": {
      const payload: NotificationPayload = { type: "round", amount: event.amount };
      return (await members(tx, event, event.actorId)).map((userId) => ({ userId, payload }));
    }
  }
}

/**
 * Écrit les notifications d'un événement, dans sa transaction, et signale
 * `notification.new` à chaque destinataire (reçu à la validation seulement).
 * Jamais l'auteur, jamais un membre parti, jamais un niveau qui ne le veut pas.
 */
export async function notify(tx: Tx, event: NotifyEvent): Promise<string[]> {
  const recipients = await recipientsOf(tx, event);
  if (recipients.length === 0) return [];
  const rows = await tx
    .insert(notifications)
    .values(
      recipients.map((r) => ({
        userId: r.userId,
        leagueId: event.leagueId,
        type: r.payload.type,
        payload: r.payload,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });
  for (const row of rows) {
    await signal(tx, {
      league: event.leagueId,
      type: "notification.new",
      id: row.id,
      user: row.userId,
    });
  }
  return rows.map((r) => r.id);
}

/** Départ d'une ligue : ses notifications de cette ligue disparaissent. */
export async function forgetLeagueNotifications(tx: Tx, leagueId: string, userId: string) {
  await tx
    .delete(notifications)
    .where(and(eq(notifications.leagueId, leagueId), eq(notifications.userId, userId)));
}
