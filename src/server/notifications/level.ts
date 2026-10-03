// Réglage par ligue (docs/M7.md, § Parcours) : tout, résultats et mentions, rien.

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leagueMembers } from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";

export const NOTIFY_LEVELS = ["all", "results_mentions", "none"] as const;
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number];

function where(leagueId: string, userId: string) {
  return and(
    eq(leagueMembers.leagueId, leagueId),
    eq(leagueMembers.userId, userId),
    isNull(leagueMembers.leftAt),
  );
}

/** Mon niveau dans la ligue ; non-membre : 404. */
export async function getNotifyLevel(
  actor: { id: string },
  leagueId: string,
): Promise<NotifyLevel> {
  await memberOrNotFound(actor.id, leagueId);
  const [row] = await getDb()
    .select({ level: leagueMembers.notifyLevel })
    .from(leagueMembers)
    .where(where(leagueId, actor.id));
  if (!row) throw new NotFoundError();
  return row.level;
}

/** Changer mon niveau dans la ligue. */
export async function setNotifyLevel(
  actor: { id: string },
  leagueId: string,
  level: unknown,
): Promise<void> {
  if (!NOTIFY_LEVELS.includes(level as NotifyLevel)) throw new NotFoundError();
  await memberOrNotFound(actor.id, leagueId);
  await getDb()
    .update(leagueMembers)
    .set({ notifyLevel: level as NotifyLevel })
    .where(where(leagueId, actor.id));
}
