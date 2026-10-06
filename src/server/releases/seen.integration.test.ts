import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { APP_VERSION } from "@/lib/version";
import { signUp } from "@/server/auth/accounts";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { markReleaseSeen, pendingReleases } from "./seen";

async function seen(userId: string, version: string | null) {
  await getDb().update(users).set({ lastSeenRelease: version }).where(eq(users.id, userId));
}

describe("suivi de lecture des nouveautés", () => {
  beforeEach(resetDb);

  it("un compte créé reçoit la version courante", async () => {
    await signUp(
      { username: "Nocly", email: "nocly@exemple.fr", password: "motdepasse", terms: true },
      new Headers(),
      new Date(),
    );
    const [row] = await getDb().select().from(users).where(eq(users.name, "Nocly"));
    expect(row!.lastSeenRelease).toBe(APP_VERSION);
  });

  it("jamais de feuille pour un compte créé à la version courante", async () => {
    await signUp(
      { username: "Paco", email: "paco@exemple.fr", password: "motdepasse", terms: true },
      new Headers(),
      new Date(),
    );
    const [row] = await getDb().select().from(users).where(eq(users.name, "Paco"));
    expect(await pendingReleases(row!)).toEqual([]);
  });

  it("plus ancienne : la feuille, une seule fois, sur tous les appareils", async () => {
    const user = await createUser();
    await seen(user.id, "0.0.1");
    expect((await pendingReleases(user))[0]).toMatchObject({ version: APP_VERSION });
    await markReleaseSeen(user);
    // Une autre session du même compte lit le même état.
    expect(await pendingReleases({ id: user.id })).toEqual([]);
  });

  it("à jour, plus récente ou sans version notée : rien", async () => {
    const user = await createUser();
    for (const version of [APP_VERSION, "99.0.0", null, "pas-une-version"]) {
      await seen(user.id, version);
      expect(await pendingReleases(user)).toEqual([]);
    }
  });
});

describe("feuille cumulée", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  beforeEach(resetDb);

  function releasesDir(versions: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "jentapp-sheet-"));
    dirs.push(dir);
    for (const v of versions)
      writeFileSync(join(dir, `${v}.md`), `title: Version ${v}\n\n- Un point.\n`);
    return dir;
  }

  it("deux versions non vues : les deux, la plus récente d'abord", async () => {
    const dir = releasesDir(["2.0.0", "2.1.0", "2.1.1", "2.2.0"]);
    const user = await createUser();
    await seen(user.id, "2.1.0");
    const versions = (await pendingReleases(user, "2.2.0", dir)).map((r) => r.version);
    expect(versions).toEqual(["2.2.0", "2.1.1"]);
  });

  it("quatre versions non vues : les trois plus récentes", async () => {
    const dir = releasesDir(["2.0.0", "2.1.0", "2.2.0", "2.3.0", "2.4.0"]);
    const user = await createUser();
    await seen(user.id, "2.0.0");
    const versions = (await pendingReleases(user, "2.4.0", dir)).map((r) => r.version);
    expect(versions).toEqual(["2.4.0", "2.3.0", "2.2.0"]);
  });

  it("une note plus récente que l'app ne s'affiche pas encore", async () => {
    const dir = releasesDir(["2.0.0", "2.1.0", "2.2.0"]);
    const user = await createUser();
    await seen(user.id, "2.0.0");
    const versions = (await pendingReleases(user, "2.1.0", dir)).map((r) => r.version);
    expect(versions).toEqual(["2.1.0"]);
  });

  it("tout est marqué lu en une fois", async () => {
    const dir = releasesDir(["2.0.0", "2.1.0", "2.2.0", "2.3.0", "2.4.0"]);
    const user = await createUser();
    await seen(user.id, "2.0.0");
    await markReleaseSeen(user, "2.4.0");
    expect(await pendingReleases(user, "2.4.0", dir)).toEqual([]);
  });
});
