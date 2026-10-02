import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { accounts, leagueMembers, leagues, sessions, users } from "@/db/schema";
import { signIn, signUp } from "@/server/auth";
import { createLeague, joinLeague, playerNames, transferLeague } from "@/server/leagues";
import { resetDb } from "@/test/db";
import { blockingLeagues, deleteAccount } from ".";

const settings = { joinGrant: 50, weeklyGrant: 10, seedAmount: 5 };

async function account(username: string) {
  const email = `${username.toLowerCase()}@exemple.fr`;
  await signUp({ username, email, password: "motdepasse", terms: true }, new Headers(), new Date());
  const [row] = await getDb().select().from(users).where(eq(users.email, email));
  return { id: row!.id, username, email };
}

async function league(ownerId: string, name: string) {
  const result = await createLeague({ id: ownerId }, { name, ...settings }, new Date());
  if (!result.ok) throw new Error("league");
  const [row] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  return row!;
}

describe("suppression de compte", () => {
  beforeEach(resetDb);

  it("demande le pseudo exact", async () => {
    const a = await account("Alpha");
    expect(await deleteAccount(a, "alpha", new Date())).toEqual({
      ok: false,
      fieldErrors: { confirmation: "Écris ton pseudo exact pour confirmer." },
    });
  });

  it("bloquée tant qu'on est owner d'une ligue à plusieurs, permise après transfert", async () => {
    const a = await account("Alpha");
    const b = await account("Bravo");
    const shared = await league(a.id, "Partagée");
    await joinLeague({ id: b.id }, shared.inviteCode, new Date());
    expect(await blockingLeagues(a.id)).toEqual([{ id: shared.id, name: "Partagée" }]);
    expect(await deleteAccount(a, "Alpha", new Date())).toEqual({
      ok: false,
      formError: "Transfère ou supprime d'abord les ligues dont tu es owner.",
    });

    await transferLeague({ id: a.id }, shared.id, b.id);
    expect(await blockingLeagues(a.id)).toEqual([]);
    expect(await deleteAccount(a, "Alpha", new Date())).toEqual({ ok: true });
  });

  it("supprime la ligue solo, anonymise le compte, garde les lignes de ligue", async () => {
    const a = await account("Alpha");
    const b = await account("Bravo");
    const solo = await league(a.id, "Solo");
    const other = await league(b.id, "Autre");
    await joinLeague({ id: a.id }, other.inviteCode, new Date());

    expect(await deleteAccount(a, "Alpha", new Date())).toEqual({ ok: true });

    expect(await getDb().select().from(leagues).where(eq(leagues.id, solo.id))).toHaveLength(0);
    const [row] = await getDb().select().from(users).where(eq(users.id, a.id));
    expect(row).toMatchObject({ name: null, email: `${a.id}@deleted.invalid`, image: null });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await getDb().select().from(accounts).where(eq(accounts.userId, a.id))).toHaveLength(0);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, a.id))).toHaveLength(0);
    const [membership] = await getDb()
      .select()
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, a.id));
    expect(membership?.leftAt).toBeInstanceOf(Date);

    // Partout où son nom apparaissait : « Joueur supprimé ».
    expect((await playerNames([a.id, b.id])).get(a.id)).toBe("Joueur supprimé");
  });

  it("la connexion est refusée ; pseudo et email redeviennent disponibles", async () => {
    const a = await account("Alpha");
    await deleteAccount(a, "Alpha", new Date());
    expect(
      await signIn({ email: a.email, password: "motdepasse" }, new Headers(), new Date()),
    ).toEqual({
      ok: false,
      formError: "Email ou mot de passe incorrect.",
    });
    const again = await signUp(
      { username: "alpha", email: a.email, password: "motdepasse", terms: true },
      new Headers(),
      new Date(),
    );
    expect(again.ok).toBe(true);
  });
});
