import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { notify as notifyPlayers } from "@/server/notifications/create";
import { appearances, NO_APPEARANCE } from "@/server/shop/appearance";
import { getDb } from "@/db/client";
import {
  betOptions,
  bets as betsTable,
  leagueMembers,
  messageMentions,
  messageReactions,
  messages,
  users,
} from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { formatOdds } from "@/server/bets/settle";
import { getBet, type BetView } from "@/server/bets/view";
import { DELETED_PLAYER, playerNames } from "@/server/leagues";
import { notify } from "@/server/realtime/notify";
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
        await notifyPlayers(tx, {
          kind: "mention",
          leagueId,
          messageId: id,
          authorId: actor.id,
          userIds: mentioned,
        });
      }
    }
    await notify(tx, { league: leagueId, type: "message.new", id });
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
    await notify(tx, { league: leagueId, type: "message.deleted", id });
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
    await notify(tx, { league: leagueId, type: "reaction.changed", id });
    return { liked: added.length > 0 };
  });
}

/** Partager un pari de la même ligue, avec un texte facultatif. */
export async function shareBet(
  actor: { id: string },
  leagueId: string,
  betId: unknown,
  body: unknown,
  now: Date,
): Promise<SendResult> {
  await memberOrNotFound(actor.id, leagueId);
  if (typeof betId !== "string" || !/^[0-9a-f-]{36}$/i.test(betId)) throw new NotFoundError();
  const [bet] = await getDb()
    .select({ id: betsTable.id })
    .from(betsTable)
    .where(and(eq(betsTable.id, betId), eq(betsTable.leagueId, leagueId)));
  if (!bet) throw new NotFoundError();
  const text = typeof body === "string" ? cleanText(body) : "";
  if (text.length > MAX_LENGTH)
    return { ok: false, error: chatMessages.tooLong(text.length - MAX_LENGTH) };
  const tooFast = await limited(actor.id, now);
  if (tooFast) return { ok: false, error: tooFast };
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        leagueId,
        userId: actor.id,
        kind: "bet",
        betId,
        body: text || null,
        createdAt: now,
      })
      .returning({ id: messages.id });
    if (text) {
      const mentioned = await resolveMentions(tx, leagueId, text);
      if (mentioned.length > 0) {
        await tx
          .insert(messageMentions)
          .values(mentioned.map((userId) => ({ messageId: row!.id, userId })));
        await notifyPlayers(tx, {
          kind: "mention",
          leagueId,
          messageId: row!.id,
          authorId: actor.id,
          userIds: mentioned,
        });
      }
    }
    await notify(tx, { league: leagueId, type: "message.new", id: row!.id });
    return { ok: true, id: row!.id } as const;
  });
}

// --- Phrases des messages automatiques -------------------------------------

type SystemData = {
  by?: string | null;
  userId?: string;
  optionId?: string;
  oddsCents?: number | null;
  refund?: boolean;
  reason?: string;
  amount?: number;
};

/** Phrase de chaque message automatique, avec les pseudos et libellés actuels. */
async function systemText(rows: MessageRow[]): Promise<Map<number, string>> {
  const system = rows.filter((r) => r.kind === "system");
  if (system.length === 0) return new Map();
  const data = (r: MessageRow) => r.data as SystemData;
  const people = new Set<string>();
  const optionIds = new Set<string>();
  for (const r of system) {
    const d = data(r);
    if (d.by) people.add(d.by);
    if (d.userId) people.add(d.userId);
    if (d.optionId) optionIds.add(d.optionId);
  }
  const [names, options] = await Promise.all([
    playerNames([...people]),
    optionIds.size
      ? getDb()
          .select({ id: betOptions.id, label: betOptions.label })
          .from(betOptions)
          .where(inArray(betOptions.id, [...optionIds]))
      : [],
  ]);
  const name = (id: string | null | undefined) =>
    id ? (names.get(id) ?? DELETED_PLAYER) : DELETED_PLAYER;
  const label = (id: string | undefined) => options.find((o) => o.id === id)?.label ?? "";

  const texts = new Map<number, string>();
  for (const r of system) {
    const d = data(r);
    let text: string;
    switch (r.event) {
      case "bet_opened":
        text = `Nouveau pari · par ${name(d.by)}`;
        break;
      case "bet_resolved":
        text = `Résultat saisi · ${label(d.optionId)} · par ${name(d.by)}`;
        break;
      case "bet_corrected":
        text = `Résultat corrigé · ${label(d.optionId)} · par ${name(d.by)}`;
        break;
      case "bet_settled":
        text = d.refund
          ? `Pari réglé · ${label(d.optionId)} · personne en face, mises rendues`
          : `Pari réglé · ${label(d.optionId)} · cote ${formatOdds(d.oddsCents ?? 0)}`;
        break;
      case "bet_cancelled":
        text =
          d.reason === "tie"
            ? `Égalité · pari annulé, mises rendues · par ${name(d.by)}`
            : d.reason === "expired"
              ? "Pari annulé · sans résultat depuis 7 jours"
              : `Pari annulé · mises rendues · par ${name(d.by)}`;
        break;
      case "round":
        text = `Tournée générale · +${d.amount} pour tous · par ${name(d.by)}`;
        break;
      case "member_joined":
        text = `${name(d.userId)} rejoint la ligue`;
        break;
      default:
        continue;
    }
    texts.set(r.id, text);
  }
  return texts;
}

// --- Lecture -------------------------------------------------------------------

export type MessageView = {
  id: number;
  kind: "text" | "gif" | "bet" | "system";
  body: string | null;
  gif: { url: string; width: number | null; height: number | null } | null;
  betId: string | null;
  /** Carte du pari partagé ou annoncé, selon ce que le lecteur a le droit de voir. */
  bet: BetView | null;
  /** Phrase d'un message automatique, écrite à la lecture. */
  text: string | null;
  author: { id: string; username: string; image: string | null; ring: string | null } | null;
  /** Pseudos mentionnés, pour les mettre en évidence. */
  mentions: string[];
  createdAt: Date;
  likes: number;
  likedByMe: boolean;
};

async function toViews(
  rows: MessageRow[],
  me: string,
  leagueId: string,
  now: Date,
): Promise<MessageView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];
  const [authors, looks, likes, mine, mentions] = await Promise.all([
    authorIds.length
      ? getDb()
          .select({ id: users.id, username: users.name })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [],
    appearances(leagueId, authorIds),
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
  const texts = await systemText(rows);
  // Cartes : un pari partagé, ou l'annonce d'un nouveau pari. Les autres messages mènent seulement à la page.
  const cardIds = [
    ...new Set(
      rows
        .filter((r) => r.betId && (r.kind === "bet" || r.event === "bet_opened"))
        .map((r) => r.betId!),
    ),
  ];
  const cards = new Map<string, BetView>();
  for (const id of cardIds) {
    try {
      cards.set(id, await getBet({ id: me }, leagueId, id, now));
    } catch {
      // Pari disparu : pas de carte.
    }
  }

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
      bet: r.betId ? (cards.get(r.betId) ?? null) : null,
      text: texts.get(r.id) ?? null,
      author: r.userId
        ? {
            id: r.userId,
            username: author?.username ?? DELETED_PLAYER,
            ...(looks.get(r.userId) ?? NO_APPEARANCE),
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
  now: Date,
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
  return toViews(rows, actor.id, leagueId, now);
}

/** Un message, pour le relire après un signal du flux. Null s'il a disparu. */
export async function readMessage(
  actor: { id: string },
  leagueId: string,
  id: number,
  now: Date,
): Promise<MessageView | null> {
  await memberOrNotFound(actor.id, leagueId);
  if (!Number.isSafeInteger(id)) return null;
  const rows = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.leagueId, leagueId), isNull(messages.deletedAt)));
  const [view] = await toViews(rows, actor.id, leagueId, now);
  return view ?? null;
}
