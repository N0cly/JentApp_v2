// Statistiques d'un membre dans une ligue (docs/M5.md, § Statistiques).
// Calculées à la lecture, sur les paris réglés : aucune table de statistiques.

import { settledStakes, type SettledStake } from "./stakes";

export type MemberStats = {
  /** Paris réglés où le membre a misé, hors paris remboursés. */
  bets: number;
  /** Parmi eux, ceux où il a misé sur l'option gagnante. */
  won: number;
  /** Gagnés ÷ paris en pourcentage entier ; null sans pari. */
  successRate: number | null;
  /** Somme de payout − mise sur ses mises des paris réglés. */
  net: number;
};

export const NO_STATS: MemberStats = { bets: 0, won: 0, successRate: null, net: 0 };

/** Pourcentage entier, arrondi au plus proche, sans flottant. */
export function successRate(won: number, bets: number): number | null {
  if (bets === 0) return null;
  return Math.floor((200 * won + bets) / (2 * bets));
}

/** Chiffres à partir des mises réglées d'un seul joueur. Pur. */
export function computeStats(stakes: SettledStake[]): MemberStats {
  let bets = 0;
  let won = 0;
  let net = 0;
  for (const stake of stakes) {
    // Remboursé : compte pour zéro, n'entre ni dans « paris » ni dans « gagnés ».
    if (stake.refund) continue;
    bets += 1;
    if (stake.won) won += 1;
    net += stake.payout - stake.amount;
  }
  return { bets, won, successRate: successRate(won, bets), net };
}

/** Chiffres d'un membre dans la ligue. Sans contrôle d'accès : à l'appelant de le faire. */
export async function memberStats(leagueId: string, userId: string): Promise<MemberStats> {
  return computeStats(await settledStakes(leagueId, userId));
}

/** Chiffres de tous les joueurs ayant misé dans la ligue, partis compris. */
export async function leagueStats(leagueId: string): Promise<Map<string, MemberStats>> {
  const byUser = new Map<string, SettledStake[]>();
  for (const stake of await settledStakes(leagueId)) {
    const list = byUser.get(stake.userId) ?? [];
    list.push(stake);
    byUser.set(stake.userId, list);
  }
  return new Map([...byUser].map(([userId, stakes]) => [userId, computeStats(stakes)]));
}
