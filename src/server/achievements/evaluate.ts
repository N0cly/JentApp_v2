// Déblocage des succès, dans la transaction de ce qui le déclenche.

import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  achievements,
  bets,
  leagueMembers,
  memberAchievements,
  memberCosmetics,
  wagers,
} from "@/db/schema";
import { post, type Tx } from "@/server/ledger";
import { settledStakes, type Executor, type SettledStake } from "@/server/stats/stakes";
import { computeStats } from "@/server/stats/stats";
import { currentStreak, type RuleType } from "./rules";

export type Trigger =
  /** Une mise : le montant ajouté et le solde juste après. */
  | { kind: "wager"; amount: number; balance: number }
  /** Un versement, pour un parieur. */
  | { kind: "payout"; betId: string }
  /** Un versement, pour le créateur du pari. */
  | { kind: "created" }
  /** Un achat. */
  | { kind: "purchase" };

const rulesFor: Record<Trigger["kind"], RuleType[]> = {
  wager: ["wagers_count", "single_stake", "all_in"],
  payout: ["wins_count", "win_streak", "broke"],
  created: ["bets_created"],
  purchase: ["purchases_count"],
};

/** Compteurs d'un membre dans une ligue, lus à la demande. */
export function memberCounters(db: Executor, leagueId: string, userId: string) {
  let stakes: Promise<SettledStake[]> | null = null;
  const settled = () => (stakes ??= settledStakes(leagueId, userId, db));
  const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
  return {
    settled,
    wagers: () =>
      one(
        db
          .select({ n: count() })
          .from(wagers)
          .innerJoin(bets, eq(bets.id, wagers.betId))
          .where(
            and(eq(bets.leagueId, leagueId), eq(wagers.userId, userId), isNull(bets.cancelledAt)),
          ),
      ),
    wins: async () => computeStats(await settled()).won,
    streak: async () => currentStreak(await settled()),
    created: () =>
      one(
        db
          .select({ n: count() })
          .from(bets)
          .where(
            and(
              eq(bets.leagueId, leagueId),
              eq(bets.createdBy, userId),
              isNotNull(bets.settledAt),
              isNull(bets.cancelledAt),
            ),
          ),
      ),
    purchases: () =>
      one(
        db
          .select({ n: count() })
          .from(memberCosmetics)
          .where(and(eq(memberCosmetics.leagueId, leagueId), eq(memberCosmetics.userId, userId))),
      ),
  };
}

/**
 * Évalue les succès d'un membre actif après un déclencheur, dans sa
 * transaction. Chaque succès débloqué écrit sa ligne et, s'il rapporte,
 * un mouvement à clé unique : jamais deux fois. Renvoie les clés débloquées.
 */
export async function evaluateAchievements(
  tx: Tx,
  leagueId: string,
  userId: string,
  trigger: Trigger,
): Promise<string[]> {
  const [member] = await tx
    .select({ leftAt: leagueMembers.leftAt, balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  if (!member || member.leftAt) return [];

  const candidates = await tx
    .select()
    .from(achievements)
    .where(
      and(eq(achievements.active, true), inArray(achievements.ruleType, rulesFor[trigger.kind])),
    )
    .orderBy(asc(achievements.position));
  if (candidates.length === 0) return [];
  const done = new Set(
    (
      await tx
        .select({ id: memberAchievements.achievementId })
        .from(memberAchievements)
        .where(
          and(eq(memberAchievements.leagueId, leagueId), eq(memberAchievements.userId, userId)),
        )
    ).map((r) => r.id),
  );

  const counters = memberCounters(tx, leagueId, userId);
  const unlocked: string[] = [];
  for (const achievement of candidates) {
    if (done.has(achievement.id)) continue;
    const n = achievement.ruleValue ?? 0;
    let met = false;
    switch (achievement.ruleType) {
      case "wagers_count":
        met = (await counters.wagers()) >= n;
        break;
      case "single_stake":
        met = trigger.kind === "wager" && trigger.amount >= n;
        break;
      case "all_in":
        met = trigger.kind === "wager" && trigger.balance === 0 && trigger.amount >= n;
        break;
      case "wins_count":
        met = (await counters.wins()) >= n;
        break;
      case "win_streak":
        met = (await counters.streak()) >= n;
        break;
      case "broke": {
        if (trigger.kind !== "payout") break;
        const stake = (await counters.settled()).find((s) => s.betId === trigger.betId);
        const [now] = await tx
          .select({ balance: leagueMembers.balance })
          .from(leagueMembers)
          .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
        met = stake !== undefined && !stake.refund && !stake.won && now?.balance === 0;
        break;
      }
      case "bets_created":
        met = (await counters.created()) >= n;
        break;
      case "purchases_count":
        met = (await counters.purchases()) >= n;
        break;
    }
    if (!met) continue;

    const inserted = await tx
      .insert(memberAchievements)
      .values({ leagueId, userId, achievementId: achievement.id })
      .onConflictDoNothing()
      .returning({ id: memberAchievements.achievementId });
    if (inserted.length === 0) continue;
    if (achievement.reward > 0) {
      await post(tx, {
        leagueId,
        userId,
        delta: achievement.reward,
        reason: "achievement",
        refId: achievement.id,
        uniqueKey: `ach:${leagueId}:${userId}:${achievement.key}`,
      });
    }
    unlocked.push(achievement.key);
  }
  return unlocked;
}
