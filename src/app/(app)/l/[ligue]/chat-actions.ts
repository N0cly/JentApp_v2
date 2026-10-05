"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import {
  deleteMessage,
  readMessage,
  readMessages,
  sendMessage,
  sendSticker,
  shareBet,
  toggleLike,
  type MessageView,
  type Outgoing,
} from "@/server/chat";
import { NotFoundError } from "@/server/errors";
import { stickerMessages } from "@/server/stickers";
import { broadcastTyping } from "@/server/realtime";
import { memberOrNotFound } from "@/server/auth";

async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function sendAction(
  leagueId: string,
  outgoing: Outgoing,
): Promise<{ id?: number; error?: string }> {
  const user = await requireUser();
  const result = await orNotFound(() => sendMessage(user, leagueId, outgoing, new Date()));
  return result.ok ? { id: result.id } : { error: result.error };
}

/** Sticker collé, avec le texte du champ : un formulaire qui porte les deux. */
export async function sendStickerAction(
  leagueId: string,
  form: FormData,
): Promise<{ id?: number; error?: string }> {
  const user = await requireUser();
  const image = form.get("sticker");
  if (!(image instanceof File)) return { error: stickerMessages.unreadable };
  const result = await orNotFound(async () =>
    sendSticker(
      user,
      leagueId,
      new Uint8Array(await image.arrayBuffer()),
      form.get("body"),
      new Date(),
    ),
  );
  return result.ok ? { id: result.id } : { error: result.error };
}

export async function shareBetAction(
  leagueId: string,
  betId: string,
  body: string,
): Promise<{ id?: number; error?: string }> {
  const user = await requireUser();
  const result = await orNotFound(() => shareBet(user, leagueId, betId, body, new Date()));
  return result.ok ? { id: result.id } : { error: result.error };
}

export async function deleteMessageAction(leagueId: string, id: number) {
  const user = await requireUser();
  await orNotFound(() => deleteMessage(user, leagueId, id, new Date()));
}

export async function toggleLikeAction(leagueId: string, id: number) {
  const user = await requireUser();
  return orNotFound(() => toggleLike(user, leagueId, id));
}

export async function readMessagesAction(
  leagueId: string,
  before?: number,
): Promise<MessageView[]> {
  const user = await requireUser();
  return orNotFound(() =>
    readMessages(user, leagueId, new Date(), before === undefined ? {} : { before }),
  );
}

export async function readMessageAction(leagueId: string, id: number): Promise<MessageView | null> {
  const user = await requireUser();
  return orNotFound(() => readMessage(user, leagueId, id, new Date()));
}

/** « écrit… » : en mémoire, au plus une fois toutes les 3 secondes. */
export async function typingAction(leagueId: string) {
  const user = await requireUser();
  await orNotFound(() => memberOrNotFound(user.id, leagueId));
  broadcastTyping(leagueId, user.id, user.username);
}
