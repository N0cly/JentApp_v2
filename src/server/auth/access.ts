import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leagueMembers } from "@/db/schema";
import { NotFoundError } from "@/server/errors";

export type Role = "player" | "admin" | "owner";

const rank: Record<Role, number> = { player: 0, admin: 1, owner: 2 };

export type Membership = { leagueId: string; userId: string; role: Role };

/**
 * Appartenance active à une ligue, avec au moins le rôle demandé.
 * Un non-membre reçoit une 404, pour ne pas révéler que la ligue existe.
 */
export async function memberOrNotFound(
  userId: string,
  leagueId: string,
  minRole: Role = "player",
): Promise<Membership> {
  if (!isUuid(leagueId)) throw new NotFoundError();
  const [member] = await getDb()
    .select({
      leagueId: leagueMembers.leagueId,
      userId: leagueMembers.userId,
      role: leagueMembers.role,
    })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.userId, userId),
        isNull(leagueMembers.leftAt),
      ),
    );
  if (!member || rank[member.role] < rank[minRole]) throw new NotFoundError();
  return member;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Le paramètre `next` n'accepte qu'un chemin interne : `/…`, jamais `//…`. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

/**
 * Où mène `/` pour un utilisateur connecté : la dernière ligue ouverte si
 * elle est encore la sienne, sinon la plus ancienne, sinon `/bienvenue`.
 */
export async function homePath(userId: string, lastLeagueId: string | undefined): Promise<string> {
  const memberships = await getDb()
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), isNull(leagueMembers.leftAt)))
    .orderBy(asc(leagueMembers.joinedAt));
  if (memberships.length === 0) return "/bienvenue";
  const last = memberships.find((m) => m.leagueId === lastLeagueId);
  return `/l/${(last ?? memberships[0]!).leagueId}/paris`;
}
