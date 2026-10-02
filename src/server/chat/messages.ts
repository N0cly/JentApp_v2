import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leagueMembers, messageMentions, messageReactions, messages, users } from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { DELETED_PLAYER } from "@/server/leagues";
import { consume, RateLimitedError, rules } from "@/server/rate-limit";
import {
  chatMessages,
  cleanText,
  isGiphyUrl,
  MAX_LENGTH,
  mentionedNames,
  PAGE_SIZE,
} from "./rules";

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type MessageRow = typeof messages.$inferSelect;

export type SendResult = { ok: true; id: number } | { ok: false; error: string };

export const LIKE = "like";

/** Membres actifs dont le pseudo est cité, casse ignorée. */
async function resolveMentions(tx: Tx, leagueId: string, text: string): Promise<string[]> {
  const names = mentionedNames(text).map((n) => n.toLowerCase());
  if (names.length === 0) return [];
  const rows = await tx
    .select({ id: users.id })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        isNull(leagueMembers.leftAt),
        inArray(sql`lower(${users.name})`, names),
      ),
    );
  return rows.map((r) => r.id);
}

async function limited(actorId: string, now: Date): Promise<string | null> {
  try {
    await consume(rules.chatMessage, actorId, now);
    return null;
  } catch (error) {
    if (error instanceof RateLimitedError) return chatMessages.tooFast;
    throw error;
  }
}

export type Outgoing =
  | { kind: "text"; body: unknown }
  | { kind: "gif"; gifUrl: unknown; width?: unknown; height?: unknown };

/** Envoyer un texte ou un GIF (membre actif, 30 par minute). */
export async function sendMessage(
  actor: { id: string },
  leagueId: string,
  outgoing: Outgoing,
  now: Date,
  /** Écrit aussi dans la transaction de l'appelant (partage d'un pari). */
  extra?: (tx: Tx, id: number) => Promise<void>,
): Promise<SendResult> {
  await memberOrNotFound(actor.id, leagueId);

  let values: Partial<MessageRow>;
  if (outgoing.kind === "text") {
    const body = typeof outgoing.body === "string" ? cleanText(outgoing.body) : "";
    if (body.length === 0) return { ok: false, error: chatMessages.empty };
    if (body.length > MAX_LENGTH)
      return { ok: false, error: chatMessages.tooLong(body.length - MAX_LENGTH) };
    values = { kind: "text", body };
  } else {
    if (!isGiphyUrl(outgoing.gifUrl)) return { ok: false, error: chatMessages.badGif };
    const dim = (v: unknown) =>
      Number.isInteger(v) && (v as number) > 0 && (v as number) < 5000 ? (v as number) : null;
    values = {
      kind: "gif",
      gifUrl: outgoing.gifUrl,
      data: { width: dim(outgoing.width), height: dim(outgoing.height) },
    };
  }

  const tooFast = await limited(actor.id, now);
  if (tooFast) return { ok: false, error: tooFast };

  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ ...values, kind: values.kind!, leagueId, userId: actor.id, createdAt: now })
      .returning({ id: messages.id });
    const id = row!.id;
    if (values.body) {
      const mentioned = await resolveMentions(tx, leagueId, values.body);
      if (mentioned.length > 0) {
        await tx
          .insert(messageMentions)
          .values(mentioned.map((userId) => ({ messageId: id, userId })));
      }
    }
    if (extra) await extra(tx, id);
    return { ok: true, id } as const;
  });
}

async function lockMessage(tx: Tx, leagueId: string, id: number) {
  if (!Number.isSafeInteger(id)) throw new NotFoundError();
  const [row] = await tx
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.leagueId, leagueId), isNull(messages.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Supprimer : ses propres messages ; un admin ou l'owner, ceux des autres.
 * Jamais un message automatique. Il disparaît sans laisser de trace.
 */
export async function deleteMessage(
  actor: { id: string },
  leagueId: string,
  id: number,
  now: Date,
) {
  const { role } = await memberOrNotFound(actor.id, leagueId);
  return getDb().transaction(async (tx) => {
    const row = await lockMessage(tx, leagueId, id);
    if (row.kind === "system") throw new NotFoundError();
    if (row.userId !== actor.id && role === "player") throw new NotFoundError();
    await tx.delete(messageReactions).where(eq(messageReactions.messageId, id));
    await tx.delete(messageMentions).where(eq(messageMentions.messageId, id));
    await tx
      .update(messages)
      .set({ deletedAt: now, body: null, gifUrl: null, betId: null, data: {} })
      .where(eq(messages.id, id));
    return { ok: true } as const;
  });
}

/** « J'aime » : un appui l'ajoute, un second le retire. */
export async function toggleLike(actor: { id: string }, leagueId: string, id: number) {
  await memberOrNotFound(actor.id, leagueId);
  return getDb().transaction(async (tx) => {
    const row = await lockMessage(tx, leagueId, id);
    if (row.kind === "system") throw new NotFoundError();
    const added = await tx
      .insert(messageReactions)
      .values({ messageId: id, userId: actor.id, emoji: LIKE })
      .onConflictDoNothing()
      .returning({ messageId: messageReactions.messageId });
    if (added.length === 0) {
      await tx
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, id),
            eq(messageReactions.userId, actor.id),
            eq(messageReactions.emoji, LIKE),
          ),
        );
    }
    return { liked: added.length > 0 };
  });
}

// --- Lecture -------------------------------------------------------------------

export type MessageView = {
  id: number;
  kind: "text" | "gif" | "bet" | "system";
  body: string | null;
  gif: { url: string; width: number | null; height: number | null } | null;
  betId: string | null;
  /** Phrase d'un message automatique, écrite à la lecture. */
  text: string | null;
  author: { id: string; username: string; image: string | null } | null;
  /** Pseudos mentionnés, pour les mettre en évidence. */
  mentions: string[];
  createdAt: Date;
  likes: number;
  likedByMe: boolean;
};

async function toViews(rows: MessageRow[], me: string): Promise<MessageView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];
  const [authors, likes, mine, mentions] = await Promise.all([
    authorIds.length
      ? getDb()
          .select({ id: users.id, username: users.name, image: users.image })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [],
    getDb()
      .select({ messageId: messageReactions.messageId, n: count() })
      .from(messageReactions)
      .where(and(inArray(messageReactions.messageId, ids), eq(messageReactions.emoji, LIKE)))
      .groupBy(messageReactions.messageId),
    getDb()
      .select({ messageId: messageReactions.messageId })
      .from(messageReactions)
      .where(
        and(
          inArray(messageReactions.messageId, ids),
          eq(messageReactions.userId, me),
          eq(messageReactions.emoji, LIKE),
        ),
      ),
    getDb()
      .select({ messageId: messageMentions.messageId, username: users.name })
      .from(messageMentions)
      .innerJoin(users, eq(users.id, messageMentions.userId))
      .where(inArray(messageMentions.messageId, ids)),
  ]);
  const byAuthor = new Map(authors.map((a) => [a.id, a]));
  const likeCount = new Map(likes.map((l) => [l.messageId, l.n]));
  const liked = new Set(mine.map((m) => m.messageId));

  return rows.map((r) => {
    const author = r.userId ? byAuthor.get(r.userId) : undefined;
    const data = r.data as { width?: number | null; height?: number | null };
    return {
      id: r.id,
      kind: r.kind,
      body: r.body,
      gif: r.gifUrl
        ? { url: r.gifUrl, width: data.width ?? null, height: data.height ?? null }
        : null,
      betId: r.betId,
      text: null,
      author: r.userId
        ? {
            id: r.userId,
            username: author?.username ?? DELETED_PLAYER,
            image: author?.image ?? null,
          }
        : null,
      mentions: mentions.filter((m) => m.messageId === r.id && m.username).map((m) => m.username!),
      createdAt: r.createdAt,
      likes: likeCount.get(r.id) ?? 0,
      likedByMe: liked.has(r.id),
    };
  });
}

/**
 * Les 50 derniers messages ; `before` remonte par pages de 50, `after` donne
 * ceux qui suivent un identifiant. Toujours dans l'ordre croissant.
 */
export async function readMessages(
  actor: { id: string },
  leagueId: string,
  page: { before?: number; after?: number } = {},
): Promise<MessageView[]> {
  await memberOrNotFound(actor.id, leagueId);
  const visible = and(eq(messages.leagueId, leagueId), isNull(messages.deletedAt));
  let rows: MessageRow[];
  if (page.after !== undefined) {
    rows = await getDb()
      .select()
      .from(messages)
      .where(and(visible, gt(messages.id, page.after)))
      .orderBy(asc(messages.id))
      .limit(PAGE_SIZE);
  } else {
    rows = (
      await getDb()
        .select()
        .from(messages)
        .where(page.before !== undefined ? and(visible, lt(messages.id, page.before)) : visible)
        .orderBy(desc(messages.id))
        .limit(PAGE_SIZE)
    ).reverse();
  }
  return toViews(rows, actor.id);
}

/** Un message, pour le relire après un signal du flux. Null s'il a disparu. */
export async function readMessage(
  actor: { id: string },
  leagueId: string,
  id: number,
): Promise<MessageView | null> {
  await memberOrNotFound(actor.id, leagueId);
  if (!Number.isSafeInteger(id)) return null;
  const rows = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.leagueId, leagueId), isNull(messages.deletedAt)));
  const [view] = await toViews(rows, actor.id);
  return view ?? null;
}
