import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { betOptions, leagues, wagers } from "@/db/schema";
import { post } from "@/server/ledger";
import { changeRole, createLeague, joinLeague } from "@/server/leagues";
import { createUser } from "./factories";

/** Une ligue avec un owner et des joueurs, chacun doté de `joinGrant`. */
export async function leagueWith(players: number, joinGrant = 50, now = new Date()) {
  const owner = await createUser();
  const result = await createLeague(
    { id: owner.id },
    { name: "Bande", joinGrant, weeklyGrant: 10, seedAmount: 5 },
    now,
  );
  if (!result.ok) throw new Error("ligue");
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  const members = [];
  for (let i = 0; i < players; i++) {
    const u = await createUser();
    await joinLeague({ id: u.id }, league!.inviteCode, now);
    members.push(u);
  }
  return { league: league!, owner, players: members };
}

export async function makeAdmin(leagueId: string, ownerId: string, userId: string) {
  await changeRole({ id: ownerId }, leagueId, userId, "admin");
}

export async function optionIds(betId: string) {
  const rows = await getDb()
    .select()
    .from(betOptions)
    .where(eq(betOptions.betId, betId))
    .orderBy(betOptions.position);
  return rows.map((r) => r.id);
}

/** Mise posée directement (débit par le journal), pour les tests d'avant la mise. */
export async function rawWager(
  leagueId: string,
  betId: string,
  userId: string,
  optionId: string,
  amount: number,
) {
  await getDb().transaction(async (tx) => {
    await post(tx, { leagueId, userId, delta: -amount, reason: "wager", refId: betId });
    await tx.insert(wagers).values({ betId, userId, optionId, amount });
  });
}
