"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { readJournal, type JournalEntry } from "@/server/journal";

/** Page suivante du journal (« Voir plus »). */
export async function moreJournalAction(
  leagueId: string,
  page: number,
): Promise<{ items: JournalEntry[]; hasMore: boolean }> {
  const user = await requireUser();
  try {
    return await readJournal(user, String(leagueId), Number(page), new Date());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
