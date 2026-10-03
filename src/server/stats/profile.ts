// Profil d'un membre (docs/M5.md, § Profil).

import { memberOrNotFound, isUuid, type Role } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { lastSettled, type HistoryItem } from "./history";
import { leagueRanking } from "./ranking";
import type { MemberStats } from "./stats";

export const PROFILE_RECENT = 5;

/** Ce que voit un membre d'un autre : pseudo, avatar, rôle et chiffres. Jamais d'email. */
export type ProfileView = {
  userId: string;
  username: string;
  image: string | null;
  role: Role;
  /** Rang de la vue Fortune. */
  rank: number;
  balance: number;
  stats: MemberStats;
  /** Derniers paris réglés, jamais un pari en cours. */
  recent: HistoryItem[];
  /** « Gérer ce membre » : l'owner seulement. */
  canManage: boolean;
};

/**
 * Seul un membre actif lit le profil d'un membre actif de la même ligue ;
 * dans tous les autres cas, 404. Rang, solde et bilan viennent du classement,
 * pour donner les mêmes chiffres partout.
 */
export async function getProfile(
  actor: { id: string },
  leagueId: string,
  targetId: string,
  now: Date,
): Promise<ProfileView> {
  const me = await memberOrNotFound(actor.id, leagueId);
  if (!isUuid(targetId)) throw new NotFoundError();
  const row = (await leagueRanking(leagueId, "fortune")).find((r) => r.userId === targetId);
  if (!row) throw new NotFoundError();
  return {
    userId: row.userId,
    username: row.username,
    image: row.image,
    role: row.role,
    rank: row.rank,
    balance: row.balance,
    stats: row.stats,
    recent: await lastSettled(leagueId, targetId, PROFILE_RECENT, now),
    canManage: me.role === "owner",
  };
}
