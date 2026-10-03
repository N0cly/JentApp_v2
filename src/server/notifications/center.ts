// Centre de notifications (docs/M7.md, § Notifications) : toutes ligues
// confondues, la plus récente d'abord, 30 par page.

import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leagues, notifications } from "@/db/schema";
import { isUuid } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import type { NotificationPayload } from "@/lib/notification-text";

export const CENTER_PAGE_SIZE = 30;
const KEEP_MS = 30 * 24 * 3600_000;

export type NotificationView = {
  id: string;
  /** Vide pour une annonce. */
  leagueId: string | null;
  /** Le nom de la ligue, ou « JentApp » pour une annonce. */
  leagueName: string;
  payload: NotificationPayload;
  read: boolean;
  createdAt: Date;
};

/**
 * Mes notifications, page par page (à partir de 0). Celles de plus de 30
 * jours sont supprimées à la lecture.
 */
export async function listNotifications(
  actor: { id: string },
  page: number,
  now: Date,
): Promise<{ items: NotificationView[]; hasMore: boolean }> {
  await getDb()
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, actor.id),
        lt(notifications.createdAt, new Date(now.getTime() - KEEP_MS)),
      ),
    );
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const rows = await getDb()
    .select({
      id: notifications.id,
      leagueId: notifications.leagueId,
      leagueName: sql<string>`coalesce(${leagues.name}, 'JentApp')`,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(leagues, eq(leagues.id, notifications.leagueId))
    .where(eq(notifications.userId, actor.id))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(CENTER_PAGE_SIZE + 1)
    .offset(safePage * CENTER_PAGE_SIZE);
  return {
    items: rows.slice(0, CENTER_PAGE_SIZE).map((r) => ({
      id: r.id,
      leagueId: r.leagueId,
      leagueName: r.leagueName,
      payload: r.payload as NotificationPayload,
      read: r.readAt !== null,
      createdAt: r.createdAt,
    })),
    hasMore: rows.length > CENTER_PAGE_SIZE,
  };
}

/** Marque lue une de mes notifications ; celle d'un autre joueur : 404. */
export async function markRead(
  actor: { id: string },
  id: string,
  now: Date,
): Promise<{ leagueId: string | null; payload: NotificationPayload }> {
  if (!isUuid(id)) throw new NotFoundError();
  const [row] = await getDb()
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now.toISOString()}::timestamptz)` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.id)))
    .returning({ leagueId: notifications.leagueId, payload: notifications.payload });
  if (!row) throw new NotFoundError();
  return { leagueId: row.leagueId, payload: row.payload as NotificationPayload };
}

/** « Tout lire ». */
export async function markAllRead(actor: { id: string }, now: Date): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}

/** La cloche porte un point tant qu'il reste du non-lu. */
export async function hasUnread(actor: { id: string }): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)))
    .limit(1);
  return row !== undefined;
}
