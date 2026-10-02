import { requireMember, type Role } from "@/server/auth";
import { settleDue } from "@/server/bets";
import { grantWeekly } from "@/server/leagues";

/**
 * Entrée d'une page de ligue : vérifie l'appartenance, verse l'allocation
 * hebdomadaire si c'est la première visite de la semaine, et les gains dus.
 */
export async function enterLeague(leagueId: string, role?: Role) {
  const member = await requireMember(leagueId, role);
  const now = new Date();
  await grantWeekly(member.user.id, leagueId, now);
  await settleDue(leagueId, now);
  return member;
}
