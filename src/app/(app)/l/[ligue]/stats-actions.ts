"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getMyHistory, getProfile, type HistoryItem, type ProfileView } from "@/server/stats";

async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** Page suivante de mon historique (« Voir plus »). */
export async function historyAction(
  leagueId: string,
  page: number,
): Promise<{ items: HistoryItem[]; hasMore: boolean }> {
  const user = await requireUser();
  return orNotFound(() => getMyHistory(user, leagueId, Number(page), new Date()));
}

/**
 * Profil d'un membre pour la feuille. Un membre parti ou supprimé n'a pas de
 * profil : null, et l'appui ne fait rien.
 */
export async function profileAction(leagueId: string, userId: string): Promise<ProfileView | null> {
  const user = await requireUser();
  try {
    return await getProfile(user, leagueId, String(userId), new Date());
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
