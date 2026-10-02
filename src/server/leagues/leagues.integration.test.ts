import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, leagueMembers, leagues } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { post } from "@/server/ledger";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import {
  changeRole,
  createLeague,
  deleteLeague,
  getLeague,
  joinLeague,
  leaveLeague,
  listMembers,
  listMyLeagues,
  previewInvite,
  regenerateInviteCode,
  removeMember,
  renameLeague,
  transferLeague,
} from "./leagues";
import { normalizeCode } from "./rules";

const settings = { joinGrant: 50, weeklyGrant: 10, seedAmount: 5 };

async function newLeague(ownerId: string, name = "Coloc") {
  const result = await createLeague({ id: ownerId }, { name, ...settings }, new Date());
  if (!result.ok) throw new Error(JSON.stringify(result));
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  return league!;
}

async function membership(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row;
}

async function auditActions(leagueId: string) {
  const rows = await getDb().select().from(auditLog).where(eq(auditLog.leagueId, leagueId));
  return rows.map((r) => r.action);
}

beforeEach(resetDb);

describe("créer", () => {
  it("le créateur devient owner, avec les réglages choisis", async () => {
    const a = await createUser();
    const league = await newLeague(a.id);
    expect(league).toMatchObject({ name: "Coloc", joinGrant: 50, weeklyGrant: 10, seedAmount: 5 });
    expect((await membership(league.id, a.id))?.role).toBe("owner");
  });

  it("valide le nom et les bornes", async () => {
    const a = await createUser();
    const result = await createLeague(
      { id: a.id },
      { name: " x ", joinGrant: 201, weeklyGrant: -1, seedAmount: 2.5 },
      new Date(),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "2 à 30 caractères.",
        joinGrant: "Un nombre entier entre 0 et 200.",
        weeklyGrant: "Un nombre entier entre 0 et 50.",
        seedAmount: "Un nombre entier entre 0 et 20.",
      },
    });
    expect(
      (await createLeague({ id: a.id }, { name: "x".repeat(31), ...settings }, new Date())).ok,
    ).toBe(false);
    expect(
      (
        await createLeague(
          { id: a.id },
          { name: "Ok", joinGrant: 200, weeklyGrant: 50, seedAmount: 20 },
          new Date(),
        )
      ).ok,
    ).toBe(true);
  });

  it("refuse une 11e ligue", async () => {
    const a = await createUser();
    for (let i = 0; i < 10; i++) await newLeague(a.id, `Ligue ${i}`);
    expect(await createLeague({ id: a.id }, { name: "Encore", ...settings }, new Date())).toEqual({
      ok: false,
      formError: "Tu es déjà dans 10 ligues. Quittes-en une pour en rejoindre une autre.",
    });
  });
});

describe("code d'invitation", () => {
  it("6 caractères de l'alphabet, saisie insensible à la casse", async () => {
    const a = await createUser();
    const league = await newLeague(a.id);
    expect(league.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(normalizeCode(` ${league.inviteCode.toLowerCase()} `)).toBe(league.inviteCode);
    expect(normalizeCode("ABC0OI")).toBeNull();
  });
});

describe("aperçu et « Invité par »", () => {
  it("ne donne que le nom, le nombre de membres et la dotation", async () => {
    const a = await createUser("Alpha");
    const b = await createUser("Bravo");
    const league = await newLeague(a.id);
    const result = await previewInvite(
      { id: b.id },
      league.inviteCode.toLowerCase(),
      new Date(),
      "alpha",
    );
    expect(result).toEqual({
      ok: true,
      preview: {
        leagueId: league.id,
        name: "Coloc",
        members: 1,
        joinGrant: 50,
        invitedBy: "Alpha",
        alreadyMember: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("@");
  });

  it("« Invité par » est omis si le pseudo n'est pas celui d'un membre actif", async () => {
    const a = await createUser("Alpha");
    const b = await createUser("Bravo");
    const league = await newLeague(a.id);
    const preview = await previewInvite({ id: b.id }, league.inviteCode, new Date(), "Inconnu");
    expect(preview.ok && preview.preview.invitedBy).toBeNull();
  });

  it("un code inconnu est refusé", async () => {
    const a = await createUser();
    expect(await previewInvite({ id: a.id }, "ZZZZZZ", new Date())).toEqual({
      ok: false,
      fieldErrors: { code: "Ce code ne correspond à aucune ligue." },
    });
  });
});

describe("rejoindre", () => {
  it("rejoint en joueur ; déjà membre, on est simplement redirigé", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    expect(await joinLeague({ id: b.id }, league.inviteCode, new Date())).toEqual({
      ok: true,
      leagueId: league.id,
    });
    expect((await membership(league.id, b.id))?.role).toBe("player");
    expect(await joinLeague({ id: b.id }, league.inviteCode, new Date())).toEqual({
      ok: true,
      leagueId: league.id,
    });
  });

  it("refuse au-delà de 50 membres", async () => {
    const a = await createUser();
    const league = await newLeague(a.id);
    for (let i = 0; i < 49; i++) {
      const u = await createUser();
      await joinLeague({ id: u.id }, league.inviteCode, new Date());
    }
    const late = await createUser();
    expect(await joinLeague({ id: late.id }, league.inviteCode, new Date())).toEqual({
      ok: false,
      formError: "Cette ligue est complète : 50 membres.",
    });
  });

  it("refuse si l'on est déjà dans 10 ligues", async () => {
    const a = await createUser();
    const b = await createUser();
    for (let i = 0; i < 10; i++) await newLeague(b.id, `Ligue ${i}`);
    const league = await newLeague(a.id);
    expect(await joinLeague({ id: b.id }, league.inviteCode, new Date())).toEqual({
      ok: false,
      formError: "Tu es déjà dans 10 ligues. Quittes-en une pour en rejoindre une autre.",
    });
  });

  it("un ancien membre retrouve sa ligne et son solde gelé, en joueur", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await changeRole({ id: a.id }, league.id, b.id, "admin");
    // Un mouvement quelconque, pour un solde distinct de la dotation.
    await getDb().transaction((tx) =>
      post(tx, { leagueId: league.id, userId: b.id, delta: 42, reason: "round" }),
    );
    await leaveLeague({ id: b.id }, league.id, new Date());
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    const row = await membership(league.id, b.id);
    // Dotation (50) et mouvement (42) retrouvés, sans nouvelle dotation.
    expect(row).toMatchObject({ balance: 92, role: "player", leftAt: null });
    expect(await getDb().select().from(leagueMembers)).toHaveLength(2);
  });

  it("10 codes inconnus par heure et par compte", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    for (let i = 0; i < 10; i++) await joinLeague({ id: b.id }, "ZZZZZZ", new Date());
    expect(await joinLeague({ id: b.id }, league.inviteCode, new Date())).toEqual({
      ok: false,
      formError: "Trop d'essais. Réessaie dans 60 minutes.",
      status: 429,
    });
    // Un autre compte n'est pas touché.
    const c = await createUser();
    expect((await joinLeague({ id: c.id }, league.inviteCode, new Date())).ok).toBe(true);
  });
});

describe("quitter", () => {
  it("un joueur quitte, la ligne reste ; l'owner doit d'abord transférer", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    expect(await leaveLeague({ id: b.id }, league.id, new Date())).toEqual({ ok: true });
    expect((await membership(league.id, b.id))?.leftAt).toBeInstanceOf(Date);
    expect(await leaveLeague({ id: a.id }, league.id, new Date())).toEqual({
      ok: false,
      formError: "Transfère la ligue avant de la quitter.",
    });
  });
});

describe("rôles", () => {
  it("seul l'owner nomme un admin, et inversement", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await joinLeague({ id: c.id }, league.inviteCode, new Date());
    await changeRole({ id: a.id }, league.id, b.id, "admin");
    expect((await membership(league.id, b.id))?.role).toBe("admin");
    // Un admin ne peut pas changer de rôle.
    await expect(changeRole({ id: b.id }, league.id, c.id, "admin")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await changeRole({ id: a.id }, league.id, b.id, "player");
    expect((await membership(league.id, b.id))?.role).toBe("player");
    expect(await auditActions(league.id)).toEqual(["role.changed", "role.changed"]);
  });

  it("un seul owner : on ne peut pas toucher au rôle de l'owner", async () => {
    const a = await createUser();
    const league = await newLeague(a.id);
    await expect(changeRole({ id: a.id }, league.id, a.id, "player")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("exclusion", () => {
  it("comme un départ ; l'exclu revient avec un code valide, pas après régénération", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await removeMember({ id: a.id }, league.id, b.id, new Date());
    expect((await membership(league.id, b.id))?.leftAt).toBeInstanceOf(Date);
    await expect(getLeague({ id: b.id }, league.id)).rejects.toBeInstanceOf(NotFoundError);

    expect((await joinLeague({ id: b.id }, league.inviteCode, new Date())).ok).toBe(true);
    await removeMember({ id: a.id }, league.id, b.id, new Date());
    const { code } = await regenerateInviteCode({ id: a.id }, league.id);
    expect(code).not.toBe(league.inviteCode);
    expect(await joinLeague({ id: b.id }, league.inviteCode, new Date())).toEqual({
      ok: false,
      fieldErrors: { code: "Ce code ne correspond à aucune ligue." },
    });
    expect(await auditActions(league.id)).toEqual([
      "member.removed",
      "member.removed",
      "invite.regenerated",
    ]);
  });
});

describe("renommer et régénérer", () => {
  it("l'ancien code cesse de marcher aussitôt", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    await renameLeague({ id: a.id }, league.id, "Nouvelle coloc");
    await regenerateInviteCode({ id: a.id }, league.id);
    expect((await previewInvite({ id: b.id }, league.inviteCode, new Date())).ok).toBe(false);
    expect((await getLeague({ id: a.id }, league.id)).name).toBe("Nouvelle coloc");
    const [entry] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.leagueId, league.id), eq(auditLog.action, "settings.changed")));
    expect(entry?.details).toEqual({ name: { from: "Coloc", to: "Nouvelle coloc" } });
  });
});

describe("transfert", () => {
  it("vers un membre actif ; l'ancien owner devient admin", async () => {
    const a = await createUser();
    const b = await createUser();
    const outsider = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await expect(transferLeague({ id: a.id }, league.id, outsider.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await transferLeague({ id: a.id }, league.id, b.id);
    expect((await membership(league.id, a.id))?.role).toBe("admin");
    expect((await membership(league.id, b.id))?.role).toBe("owner");
    const [row] = await getDb().select().from(leagues).where(eq(leagues.id, league.id));
    expect(row?.ownerId).toBe(b.id);
    expect(await auditActions(league.id)).toEqual(["league.transferred"]);
    // L'ancien owner peut maintenant partir.
    expect(await leaveLeague({ id: a.id }, league.id, new Date())).toEqual({ ok: true });
  });
});

describe("suppression", () => {
  it("demande le nom exact et supprime tout ce qui appartient à la ligue", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await regenerateInviteCode({ id: a.id }, league.id);
    expect(await deleteLeague({ id: a.id }, league.id, "coloc")).toEqual({
      ok: false,
      fieldErrors: { confirmation: "Écris le nom exact de la ligue pour confirmer." },
    });
    expect(await deleteLeague({ id: a.id }, league.id, "Coloc")).toEqual({ ok: true });
    expect(await getDb().select().from(leagues)).toHaveLength(0);
    expect(await getDb().select().from(leagueMembers)).toHaveLength(0);
    expect(await getDb().select().from(auditLog)).toHaveLength(0);
  });
});

describe("lecture", () => {
  it("chacun ne voit que ses ligues, avec solde et membres", async () => {
    const a = await createUser();
    const b = await createUser();
    const l1 = await newLeague(a.id, "Une");
    await newLeague(b.id, "Deux");
    await joinLeague({ id: b.id }, l1.inviteCode, new Date());
    expect((await listMyLeagues({ id: a.id })).map((l) => l.name)).toEqual(["Une"]);
    expect(await listMyLeagues({ id: b.id })).toEqual([
      expect.objectContaining({ name: "Deux", members: 1, balance: 50, openBets: 0 }),
      expect.objectContaining({ name: "Une", members: 2, balance: 50, openBets: 0 }),
    ]);
  });

  it("la liste des membres ne contient aucun email", async () => {
    const a = await createUser("Alpha");
    const b = await createUser("Bravo");
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    const members = await listMembers({ id: b.id }, league.id);
    expect(members.map((m) => [m.username, m.role])).toEqual([
      ["Alpha", "owner"],
      ["Bravo", "player"],
    ]);
    expect(JSON.stringify(members)).not.toContain("@");
    expect(Object.keys(members[0]!).sort()).toEqual([
      "image",
      "joinedAt",
      "role",
      "userId",
      "username",
    ]);
  });
});

describe("non-membre", () => {
  it("reçoit une 404 sur toute action d'une ligue", async () => {
    const a = await createUser();
    const b = await createUser();
    const x = await createUser();
    const league = await newLeague(a.id);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    const me = { id: x.id };
    const calls = [
      () => getLeague(me, league.id),
      () => listMembers(me, league.id),
      () => leaveLeague(me, league.id, new Date()),
      () => changeRole(me, league.id, b.id, "admin"),
      () => removeMember(me, league.id, b.id, new Date()),
      () => renameLeague(me, league.id, "Piratée"),
      () => regenerateInviteCode(me, league.id),
      () => transferLeague(me, league.id, b.id),
      () => deleteLeague(me, league.id, "Coloc"),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(NotFoundError);
    // Un membre sans le rôle requis reçoit la même réponse.
    await expect(renameLeague({ id: b.id }, league.id, "Piratée")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await auditActions(league.id)).toEqual([]);
  });
});
