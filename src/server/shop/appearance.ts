// Apparence d'un membre dans une ligue (docs/M6.md, § Cosmétiques). La seule
// règle qui décide de l'image et de l'anneau affichés par `Avatar`.

import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { cosmetics, leagueMembers, users } from "@/db/schema";

export type Appearance = {
  /** L'avatar porté, sinon la photo du compte ; vide : l'initiale. */
  image: string | null;
  /** Couleur de la bordure portée ; vide : l'anneau par défaut. */
  ring: string | null;
};

export const NO_APPEARANCE: Appearance = { image: null, ring: null };

/** Pur : avatar porté, puis photo, puis initiale ; bordure portée, sinon rien. */
export function resolveAppearance(input: {
  avatarImage: string | null;
  photo: string | null;
  borderTint: string | null;
}): Appearance {
  return { image: input.avatarImage ?? input.photo ?? null, ring: input.borderTint ?? null };
}

const avatar = alias(cosmetics, "avatar");
const border = alias(cosmetics, "border");

/** Apparence de joueurs dans une ligue, partis compris. */
export async function appearances(
  leagueId: string,
  userIds: string[],
): Promise<Map<string, Appearance>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      userId: leagueMembers.userId,
      photo: users.image,
      avatarImage: avatar.imageUrl,
      borderTint: border.tintColor,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .leftJoin(avatar, eq(avatar.id, leagueMembers.avatarCosmeticId))
    .leftJoin(border, eq(border.id, leagueMembers.borderCosmeticId))
    .where(and(eq(leagueMembers.leagueId, leagueId), inArray(leagueMembers.userId, ids)));
  return new Map(rows.map((r) => [r.userId, resolveAppearance(r)]));
}

/** Apparence d'un seul membre. */
export async function appearanceOf(leagueId: string, userId: string): Promise<Appearance> {
  return (await appearances(leagueId, [userId])).get(userId) ?? NO_APPEARANCE;
}
