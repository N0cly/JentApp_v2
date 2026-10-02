import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { leagueMembers, leagues, users } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { resetDb } from "@/test/db";
import { homePath, memberOrNotFound, safeNext } from "./access";

async function user(name: string) {
  const [u] = await getDb()
    .insert(users)
    .values({ name, email: `${name}@exemple.fr` })
    .returning();
  return u!;
}

async function league(ownerId: string, code: string) {
  const [l] = await getDb()
    .insert(leagues)
    .values({ name: code, inviteCode: code, ownerId })
    .returning();
  await getDb().insert(leagueMembers).values({ leagueId: l!.id, userId: ownerId, role: "owner" });
  return l!;
}

describe("garde d'accès", () => {
  beforeEach(resetDb);

  it("un membre passe, un non-membre reçoit une 404", async () => {
    const a = await user("a");
    const b = await user("b");
    const l = await league(a.id, "AAAAAA");
    await expect(memberOrNotFound(a.id, l.id)).resolves.toMatchObject({ role: "owner" });
    await expect(memberOrNotFound(b.id, l.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("une ligue inconnue ou un identifiant invalide reçoit la même 404", async () => {
    const a = await user("a");
    await expect(
      memberOrNotFound(a.id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(memberOrNotFound(a.id, "pas-un-uuid")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un ancien membre et un rôle insuffisant reçoivent une 404", async () => {
    const a = await user("a");
    const b = await user("b");
    const l = await league(a.id, "AAAAAA");
    await getDb().insert(leagueMembers).values({ leagueId: l.id, userId: b.id });
    await expect(memberOrNotFound(b.id, l.id, "admin")).rejects.toBeInstanceOf(NotFoundError);
    await getDb()
      .update(leagueMembers)
      .set({ leftAt: new Date() })
      .where(eq(leagueMembers.userId, b.id));
    await expect(memberOrNotFound(b.id, l.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("/ mène à la dernière ligue ouverte, sinon la plus ancienne, sinon /bienvenue", async () => {
    const a = await user("a");
    expect(await homePath(a.id, undefined)).toBe("/bienvenue");
    const first = await league(a.id, "AAAAAA");
    const second = await league(a.id, "BBBBBB");
    expect(await homePath(a.id, undefined)).toBe(`/l/${first.id}/paris`);
    expect(await homePath(a.id, second.id)).toBe(`/l/${second.id}/paris`);
    expect(await homePath(a.id, "00000000-0000-4000-8000-000000000000")).toBe(
      `/l/${first.id}/paris`,
    );
  });
});

describe("paramètre next", () => {
  it("n'accepte qu'un chemin interne", () => {
    expect(safeNext("/j/ABCDEF")).toBe("/j/ABCDEF");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});
