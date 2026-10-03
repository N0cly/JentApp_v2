"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getMyHistory, type HistoryItem } from "@/server/stats";

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
