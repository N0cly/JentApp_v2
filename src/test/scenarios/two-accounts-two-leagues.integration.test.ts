import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getSessionUser, homePath, memberOrNotFound, signUp } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import {
  changeRole,
  createLeague,
  getLeague,
  joinLeague,
  listMembers,
  listMyLeagues,
  previewInvite,
} from "@/server/leagues";
import { resetDb } from "@/test/db";
import { requestHeaders } from "@/test/http";

// Critère de fin de M1 : deux comptes cohabitent dans deux ligues, avec des
// rôles différents, et chacun ne voit que les ligues dont il est membre.

async function register(username: string) {
  const result = await signUp(
    {
      username,
      email: `${username.toLowerCase()}@exemple.fr`,
      password: "motdepasse",
      terms: true,
    },
    new Headers(),
    new Date(),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const me = await getSessionUser(requestHeaders(result.headers));
  return me!;
}

const settings = { joinGrant: 50, weeklyGrant: 10, seedAmount: 5 };

describe("scénario : deux comptes, deux ligues", () => {
  beforeEach(resetDb);

  it("se joue de bout en bout", async () => {
    const a = await register("Alpha");
    const b = await register("Bravo");

    // A crée la ligue 1.
    const one = await createLeague(a, { name: "Ligue 1", ...settings }, new Date());
    if (!one.ok) throw new Error("ligue 1");
    const league1 = await getLeague(a, one.leagueId);
    expect(league1.myRole).toBe("owner");

    // B la rejoint par le lien partagé par A : /j/{code}?par=Alpha.
    const preview = await previewInvite(b, league1.inviteCode, new Date(), "Alpha");
    expect(preview).toMatchObject({
      ok: true,
      preview: { name: "Ligue 1", invitedBy: "Alpha", members: 1 },
    });
    expect(await joinLeague(b, league1.inviteCode, new Date())).toEqual({
      ok: true,
      leagueId: league1.id,
    });

    // B crée la ligue 2, A la rejoint par le code, tapé en minuscules.
    const two = await createLeague(b, { name: "Ligue 2", ...settings }, new Date());
    if (!two.ok) throw new Error("ligue 2");
    const league2 = await getLeague(b, two.leagueId);
    expect(await joinLeague(a, league2.inviteCode.toLowerCase(), new Date())).toEqual({
      ok: true,
      leagueId: league2.id,
    });

    // Chacun passe d'une ligue à l'autre par « Tes ligues ».
    for (const player of [a, b]) {
      const mine = await listMyLeagues(player);
      expect(mine.map((l) => l.name)).toEqual(["Ligue 1", "Ligue 2"]);
      for (const l of mine) {
        expect(await homePath(player.id, l.id)).toBe(`/l/${l.id}/paris`);
      }
    }

    // A nomme B admin de la ligue 1.
    await changeRole(a, league1.id, b.id, "admin");

    const roles = async (leagueId: string, viewer: { id: string }) =>
      Object.fromEntries((await listMembers(viewer, leagueId)).map((m) => [m.username, m.role]));
    expect(await roles(league1.id, b)).toEqual({ Alpha: "owner", Bravo: "admin" });
    expect(await roles(league2.id, a)).toEqual({ Bravo: "owner", Alpha: "player" });

    // Un troisième compte ne voit aucune des deux ligues.
    const c = await register("Charlie");
    expect(await listMyLeagues(c)).toEqual([]);
    expect(await homePath(c.id, league1.id)).toBe("/bienvenue");
    for (const id of [league1.id, league2.id]) {
      await expect(memberOrNotFound(c.id, id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getLeague(c, id)).rejects.toBeInstanceOf(NotFoundError);
    }

    // Aucune donnée renvoyée aux autres joueurs ne contient d'email.
    const emails = (await getDb().select({ email: users.email }).from(users)).map((u) => u.email);
    const shared = JSON.stringify([
      await listMembers(a, league1.id),
      await listMembers(b, league2.id),
      await previewInvite(c, league1.inviteCode, new Date()),
    ]);
    for (const email of emails) expect(shared).not.toContain(email);
    expect(await getDb().select().from(users).where(eq(users.id, c.id))).toHaveLength(1);
  });
});
