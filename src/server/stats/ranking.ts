// Classement d'une ligue (docs/M5.md, § Classement). Membres actifs seulement,
// rangs de 1 à n sans ex æquo.

import { and, count, eq, gt, isNotNull, isNull, lte, min } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bets, leagueMembers, users } from "@/db/schema";
import { memberOrNotFound, type Role } from "@/server/auth/access";
import { settleDelayMs } from "@/server/bets/rules";
import { DELETED_PLAYER } from "@/server/leagues";
import { appearances, NO_APPEARANCE } from "@/server/shop/appearance";
import { leagueStats, NO_STATS, type MemberStats } from "./stats";

export type RankingSort = "fortune" | "net";

export type RankingRow = {
  userId: string;
  username: string;
  image: string | null;
  ring: string | null;
  role: Role;
  balance: number;
  joinedAt: Date;
  stats: MemberStats;
  /** Rang dans le tri demandé, à partir de 1. */
  rank: number;
};

type Unranked = Omit<RankingRow, "rank">;

const byAge = (a: Unranked, b: Unranked) =>
  a.joinedAt.getTime() - b.joinedAt.getTime() ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

const comparators: Record<RankingSort, (a: Unranked, b: Unranked) => number> = {
  // Solde, puis bilan, puis le plus ancien dans la ligue.
  fortune: (a, b) => b.balance - a.balance || b.stats.net - a.stats.net || byAge(a, b),
  // Bilan, puis solde, puis le plus ancien.
  net: (a, b) => b.stats.net - a.stats.net || b.balance - a.balance || byAge(a, b),
};

/** Trie et numérote. Pur. */
export function rankRows(rows: Unranked[], sort: RankingSort): RankingRow[] {
  return [...rows].sort(comparators[sort]).map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Classement des membres actifs. Sans contrôle d'accès : à l'appelant de le faire. */
export async function leagueRanking(leagueId: string, sort: RankingSort): Promise<RankingRow[]> {
  const [members, stats] = await Promise.all([
    getDb()
      .select({
        userId: leagueMembers.userId,
        username: users.name,
        role: leagueMembers.role,
        balance: leagueMembers.balance,
        joinedAt: leagueMembers.joinedAt,
      })
      .from(leagueMembers)
      .innerJoin(users, eq(users.id, leagueMembers.userId))
      .where(and(eq(leagueMembers.leagueId, leagueId), isNull(leagueMembers.leftAt))),
    leagueStats(leagueId),
  ]);
  const looks = await appearances(
    leagueId,
    members.map((m) => m.userId),
  );
  return rankRows(
    members.map((m) => ({
      ...m,
      ...(looks.get(m.userId) ?? NO_APPEARANCE),
      username: m.username ?? DELETED_PLAYER,
      stats: stats.get(m.userId) ?? NO_STATS,
    })),
    sort,
  );
}

/** Paris ouverts de la ligue à `now` : ouverts, pas encore fermés, ni saisis ni annulés. */
export async function countOpenBets(leagueId: string, now: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(bets)
    .where(
      and(
        eq(bets.leagueId, leagueId),
        lte(bets.opensAt, now),
        gt(bets.closesAt, now),
        isNull(bets.resolvedAt),
        isNull(bets.settledAt),
        isNull(bets.cancelledAt),
      ),
    );
  return row?.n ?? 0;
}

/** Carte sous ma ligne, vue Fortune. */
export type RankingCard =
  | { kind: "alone" }
  | { kind: "leader"; lead: number; rival: string; openBets: number }
  | { kind: "behind"; gap: number; rival: string; openBets: number };

/** Carte à partir du classement Fortune. Pur. */
export function rankingCard(
  fortune: RankingRow[],
  userId: string,
  openBets: number,
): RankingCard | null {
  const index = fortune.findIndex((r) => r.userId === userId);
  if (index === -1) return null;
  const me = fortune[index]!;
  if (fortune.length === 1) return { kind: "alone" };
  if (index === 0) {
    const second = fortune[1]!;
    return { kind: "leader", lead: me.balance - second.balance, rival: second.username, openBets };
  }
  const above = fortune[index - 1]!;
  return { kind: "behind", gap: above.balance - me.balance, rival: above.username, openBets };
}

export type RankingView = { rows: RankingRow[]; card: RankingCard | null };

/** Classement lu par un membre actif ; sinon 404. La carte n'existe qu'en vue Fortune. */
export async function getRanking(
  actor: { id: string },
  leagueId: string,
  sort: RankingSort,
  now: Date,
): Promise<RankingView> {
  await memberOrNotFound(actor.id, leagueId);
  const rows = await leagueRanking(leagueId, sort);
  if (sort !== "fortune") return { rows, card: null };
  return { rows, card: rankingCard(rows, actor.id, await countOpenBets(leagueId, now)) };
}

/**
 * Prochain instant où le classement change sans action de personne : un
 * versement dû (le règlement se fait à la lecture) ou un pari qui s'ouvre ou
 * se ferme (la carte compte les paris ouverts). Null s'il n'y en a pas.
 */
export async function nextRankingChange(leagueId: string, now: Date): Promise<Date | null> {
  const live = and(eq(bets.leagueId, leagueId), isNull(bets.cancelledAt), isNull(bets.settledAt));
  const [row] = await getDb()
    .select({ payout: min(bets.resolvedAt) })
    .from(bets)
    .where(and(live, isNotNull(bets.resolvedAt)));
  const [open] = await getDb()
    .select({ opens: min(bets.opensAt) })
    .from(bets)
    .where(and(live, isNull(bets.resolvedAt), gt(bets.opensAt, now)));
  const [close] = await getDb()
    .select({ closes: min(bets.closesAt) })
    .from(bets)
    .where(and(live, isNull(bets.resolvedAt), gt(bets.closesAt, now)));
  const candidates = [
    row?.payout ? new Date(row.payout.getTime() + settleDelayMs()) : null,
    open?.opens ?? null,
    close?.closes ?? null,
  ].filter((d): d is Date => d !== null);
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}
