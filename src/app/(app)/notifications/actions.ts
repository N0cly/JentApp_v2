"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import {
  listNotifications,
  markAllRead,
  markRead,
  type NotificationView,
} from "@/server/notifications";
import { centerHref } from "@/lib/notification-text";

/**
 * Marque lue et renvoie le lien à ouvrir, rien pour une annonce ; la
 * notification d'un autre : 404.
 */
export async function openNotificationAction(id: string): Promise<string | null> {
  const user = await requireUser();
  try {
    const { leagueId, payload } = await markRead(user, String(id), new Date());
    return centerHref(leagueId, payload);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user, new Date());
}

export async function moreNotificationsAction(
  page: number,
): Promise<{ items: NotificationView[]; hasMore: boolean }> {
  const user = await requireUser();
  return listNotifications(user, Number(page), new Date());
}
