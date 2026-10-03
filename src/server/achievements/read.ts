// Onglet Succès de Moi : ce que voit un joueur de ses succès dans une ligue.

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { achievements, memberAchievements } from "@/db/schema";
import { memberOrNotFound } from "@/server/auth/access";
import { memberCounters } from "./evaluate";
import { describeRule, hasProgress, type RuleType } from "./rules";

/**
 * Un succès caché non débloqué ne quitte le serveur qu'avec son identifiant :
 * ni nom, ni règle, ni récompense.
 */
export type AchievementView =
  | { id: string; hidden: true }
  | {
      id: string;
      hidden: false;
      name: string;
      description: string;
      reward: number;
      unlocked: boolean;
      /** « {x} sur {n} », pour les règles qui comptent et tant que c'est verrouillé. */
      progress: { current: number; target: number } | null;
    };

export type MyAchievements = { unlocked: number; total: number; items: AchievementView[] };

async function progressOf(
  counters: ReturnType<typeof memberCounters>,
  rule: RuleType,
): Promise<number> {
  switch (rule) {
    case "wagers_count":
      return counters.wagers();
    case "wins_count":
      return counters.wins();
    case "win_streak":
      return counters.streak();
    case "bets_created":
      return counters.created();
    case "purchases_count":
      return counters.purchases();
    default:
      return 0;
  }
}

/**
 * Mes succès dans la ligue : les actifs, plus les désactivés que j'ai déjà.
 * Débloqués d'abord, puis les autres, dans l'ordre du catalogue ; les cachés
 * non débloqués à la fin.
 */
export async function myAchievements(
  actor: { id: string },
  leagueId: string,
): Promise<MyAchievements> {
  await memberOrNotFound(actor.id, leagueId);
  const [all, mine] = await Promise.all([
    getDb()
      .select()
      .from(achievements)
      .orderBy(asc(achievements.position), asc(achievements.createdAt)),
    getDb()
      .select({ id: memberAchievements.achievementId })
      .from(memberAchievements)
      .where(
        and(eq(memberAchievements.leagueId, leagueId), eq(memberAchievements.userId, actor.id)),
      ),
  ]);
  const unlockedIds = new Set(mine.map((m) => m.id));
  const shown = all.filter((a) => a.active || unlockedIds.has(a.id));
  const counters = memberCounters(getDb(), leagueId, actor.id);

  const items: { rank: number; view: AchievementView }[] = [];
  for (const a of shown) {
    const unlocked = unlockedIds.has(a.id);
    if (a.hidden && !unlocked) {
      items.push({ rank: 2, view: { id: a.id, hidden: true } });
      continue;
    }
    const target = a.ruleValue ?? 0;
    const progress =
      !unlocked && hasProgress(a.ruleType)
        ? { current: Math.min(await progressOf(counters, a.ruleType), target), target }
        : null;
    items.push({
      rank: unlocked ? 0 : 1,
      view: {
        id: a.id,
        hidden: false,
        name: a.name,
        description: describeRule(a.ruleType, a.ruleValue),
        reward: a.reward,
        unlocked,
        progress,
      },
    });
  }
  // Tri stable : l'ordre du catalogue est gardé dans chaque groupe.
  items.sort((x, y) => x.rank - y.rank);
  return {
    unlocked: shown.filter((a) => unlockedIds.has(a.id)).length,
    total: shown.length,
    items: items.map((i) => i.view),
  };
}
