import { and, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accounts,
  leagueMembers,
  leagues,
  rateLimits,
  sessions,
  users,
  verifications,
} from "@/db/schema";
import { deletePhotoFile } from "@/server/avatars";

export const deleteMessages = {
  confirm: "Écris ton pseudo exact pour confirmer.",
  stillOwner: "Transfère ou supprime d'abord les ligues dont tu es owner.",
} as const;

export type BlockingLeague = { id: string; name: string };

/** Ligues dont l'utilisateur est owner et qui ont d'autres membres actifs. */
export async function blockingLeagues(
  userId: string,
  executor: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<BlockingLeague[]> {
  return executor
    .select({ id: leagues.id, name: leagues.name })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(
      and(
        eq(leagueMembers.userId, userId),
        eq(leagueMembers.role, "owner"),
        isNull(leagueMembers.leftAt),
        sql`exists (select 1 from ${leagueMembers} m where m.league_id = ${leagues.id} and m.user_id <> ${userId} and m.left_at is null)`,
      ),
    );
}

/**
 * Suppression de compte (spec §15, docs/M1.md) : la ligne `users` reste,
 * anonymisée ; mises, gains et journal gardent leur auteur sans son nom.
 */
export async function deleteAccount(
  user: { id: string; username: string; email: string },
  confirmation: unknown,
  now: Date,
): Promise<
  { ok: true } | { ok: false; fieldErrors?: { confirmation: string }; formError?: string }
> {
  if (typeof confirmation !== "string" || confirmation.trim() !== user.username) {
    return { ok: false, fieldErrors: { confirmation: deleteMessages.confirm } };
  }

  const photo = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where ${users.id} = ${user.id} for update`);
    if ((await blockingLeagues(user.id, tx)).length > 0) return { blocked: true } as const;

    // Une ligue dont il est le seul membre disparaît avec le compte.
    const solo = await tx
      .select({ id: leagues.id })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(
        and(
          eq(leagueMembers.userId, user.id),
          eq(leagueMembers.role, "owner"),
          isNull(leagueMembers.leftAt),
        ),
      );
    if (solo.length > 0) {
      await tx.delete(leagues).where(
        inArray(
          leagues.id,
          solo.map((l) => l.id),
        ),
      );
    }

    await tx
      .update(leagueMembers)
      .set({ leftAt: now })
      .where(and(eq(leagueMembers.userId, user.id), isNull(leagueMembers.leftAt)));

    const [row] = await tx.select({ image: users.image }).from(users).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(accounts).where(eq(accounts.userId, user.id));
    await tx
      .delete(verifications)
      .where(or(eq(verifications.value, user.id), eq(verifications.identifier, user.email)));
    await tx.delete(rateLimits).where(like(rateLimits.key, `%:${user.email.toLowerCase()}`));
    await tx
      .update(users)
      .set({
        name: null,
        email: `${user.id}@deleted.invalid`,
        emailVerified: false,
        image: null,
        deletedAt: now,
      })
      .where(and(eq(users.id, user.id), ne(users.email, `${user.id}@deleted.invalid`)));
    return { blocked: false, image: row?.image ?? null } as const;
  });

  if (photo.blocked) return { ok: false, formError: deleteMessages.stillOwner };
  await deletePhotoFile(photo.image);
  return { ok: true };
}
