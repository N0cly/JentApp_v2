import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { appMeta, releases } from "@/db/schema";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { announceRelease, RELEASE_META_KEY } from "./announce";
import { parseRelease } from "./notes";
import { parisDay, withReleaseDates } from "./released";

const V2_1 = { version: "2.1.0", title: "Les stickers arrivent" };

async function releasedAt(version: string) {
  const [row] = await getDb().select().from(releases).where(eq(releases.version, version));
  return row?.releasedAt ?? null;
}

beforeEach(async () => {
  await resetDb();
  await getDb().delete(appMeta).where(eq(appMeta.key, RELEASE_META_KEY));
});

describe("date de mise en ligne", () => {
  it("enregistrée au premier démarrage d'une version, inchangée au suivant", async () => {
    await getDb().insert(appMeta).values({ key: RELEASE_META_KEY, value: "2.0.0" });
    expect(await releasedAt("2.1.0")).toBeNull();
    await announceRelease(V2_1);
    const first = await releasedAt("2.1.0");
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 20));
    expect(await announceRelease(V2_1)).toMatchObject({ kind: "unchanged" });
    expect(await releasedAt("2.1.0")).toEqual(first);
  });

  it("aussi au tout premier démarrage, sans annonce", async () => {
    expect(await announceRelease(V2_1)).toMatchObject({ kind: "initialized" });
    expect(await releasedAt("2.1.0")).toBeInstanceOf(Date);
  });

  it("annonce en échec : pas de date non plus, tout est dans la même transaction", async () => {
    await getDb().insert(appMeta).values({ key: RELEASE_META_KEY, value: "2.0.0" });
    await getDb().execute(
      sql`alter table notifications add constraint fail_release check (type <> 'release')`,
    );
    try {
      await createUser();
      await expect(announceRelease(V2_1)).rejects.toThrow();
      expect(await releasedAt("2.1.0")).toBeNull();
    } finally {
      await getDb().execute(sql`alter table notifications drop constraint fail_release`);
    }
  });

  it("la page lit la date du démarrage ; celle du fichier l'emporte", async () => {
    await getDb()
      .insert(releases)
      .values([
        { version: "2.0.0", releasedAt: new Date("2026-10-03T22:30:00Z") },
        { version: "2.1.0", releasedAt: new Date("2026-10-05T22:30:00Z") },
      ]);
    const notes = [
      parseRelease("2.2.0", "title: Pas encore partie\n\n- Un point.\n"),
      parseRelease("2.1.0", "title: Sans date\n\n- Un point.\n"),
      parseRelease("2.0.0", "title: Datée\ndate: 2026-10-01\n\n- Un point.\n"),
    ];
    expect((await withReleaseDates(notes)).map((n) => [n.version, n.date])).toEqual([
      ["2.2.0", null],
      ["2.1.0", "2026-10-06"],
      ["2.0.0", "2026-10-01"],
    ]);
  });
});

describe("jour de mise en ligne", () => {
  it("à l'heure de Paris", () => {
    expect(parisDay(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(parisDay(new Date("2026-10-05T12:00:00Z"))).toBe("2026-10-05");
  });
});
