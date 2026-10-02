import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leagueMembers, leagues } from "@/db/schema";
import { post } from "@/server/ledger";
import { weekKey, weekStart } from "@/lib/week";

/**
 * Allocation hebdomadaire, versée à la première visite de la semaine (lundi
 * 00:00, heure de Paris). Rien la semaine d'arrivée, rien à 0, pas de
 * rattrapage des semaines d'absence. Silencieuse : seul le solde change.
 */
export async function grantWeekly(userId: string, leagueId: string, now: Date): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ joinedAt: leagueMembers.joinedAt, weeklyGrant: leagues.weeklyGrant })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(
        and(
          eq(leagueMembers.leagueId, leagueId),
          eq(leagueMembers.userId, userId),
          isNull(leagueMembers.leftAt),
        ),
      );
    if (!row || row.weeklyGrant <= 0) return false;
    // La semaine d'arrivée est couverte par la dotation.
    if (row.joinedAt >= weekStart(now)) return false;
    const { applied } = await post(tx, {
      leagueId,
      userId,
      delta: row.weeklyGrant,
      reason: "weekly_grant",
      uniqueKey: `week:${leagueId}:${userId}:${weekKey(now)}`,
    });
    return applied;
  });
}
