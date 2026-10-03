import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NotFoundError } from "@/server/errors";
import { identifyPlayer } from "@/server/monitoring";
import { getSessionUser, type SessionUser } from "./accounts";
import { memberOrNotFound, type Membership, type Role } from "./access";

// À appeler dans chaque page, action et route : pas de middleware seul.

/** Utilisateur connecté, ou redirection vers la connexion qui ramène ici. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser(await headers());
  if (!user) {
    redirect(nextPath ? `/connexion?next=${encodeURIComponent(nextPath)}` : "/connexion");
  }
  identifyPlayer(user.id);
  return user;
}

/** Super-admin connecté ; tout autre compte reçoit une 404. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) notFound();
  return user;
}

/** Membre actif de la ligue avec le rôle demandé, sinon 404. */
export async function requireMember(
  leagueId: string,
  role?: Role,
): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireUser(`/l/${leagueId}/paris`);
  try {
    return { user, membership: await memberOrNotFound(user.id, leagueId, role) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
