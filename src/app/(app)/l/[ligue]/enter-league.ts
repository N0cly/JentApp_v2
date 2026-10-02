import { requireMember, type Role } from "@/server/auth";
import { grantWeekly } from "@/server/leagues";

/**
 * Entrée d'une page de ligue : vérifie l'appartenance, puis verse
 * l'allocation hebdomadaire si c'est la première visite de la semaine.
 */
export async function enterLeague(leagueId: string, role?: Role) {
  const member = await requireMember(leagueId, role);
  await grantWeekly(member.user.id, leagueId, new Date());
  return member;
}
