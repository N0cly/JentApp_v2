import type { getDb } from "@/db/client";
import { messages } from "@/db/schema";
import { notify } from "@/server/realtime/notify";

// Écrit un message automatique dans la transaction de l'événement qui le
// cause : si elle est annulée, le message n'existe pas. Ne dépend que du
// schéma, pour être appelé depuis les paris et les ligues.

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type SystemEvent =
  | { event: "bet_opened"; betId: string; data: { by: string } }
  | { event: "bet_resolved"; betId: string; data: { by: string; optionId: string } }
  | { event: "bet_corrected"; betId: string; data: { by: string; optionId: string } }
  | {
      event: "bet_settled";
      betId: string;
      data: { optionId: string; oddsCents: number | null; refund: boolean };
    }
  | {
      event: "bet_cancelled";
      betId: string;
      data: { by: string | null; reason: "creator" | "admin" | "tie" | "expired" };
    }
  | { event: "round"; data: { by: string; amount: number } }
  | { event: "member_joined"; data: { userId: string } };

export async function postSystemMessage(tx: Tx, leagueId: string, message: SystemEvent, now: Date) {
  const [row] = await tx
    .insert(messages)
    .values({
      leagueId,
      userId: null,
      kind: "system",
      event: message.event,
      betId: "betId" in message ? message.betId : null,
      data: message.data,
      createdAt: now,
    })
    .returning({ id: messages.id });
  await notify(tx, { league: leagueId, type: "message.new", id: row!.id });
}
