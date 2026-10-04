import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { APP_VERSION } from "@/lib/version";
import { signUp } from "@/server/auth/accounts";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { markReleaseSeen, pendingRelease } from "./seen";

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
    expect(await pendingRelease(row!)).toBeNull();
  });

  it("plus ancienne : la feuille de la version courante, une seule fois, sur tous les appareils", async () => {
    const user = await createUser();
    await seen(user.id, "0.0.1");
    expect(await pendingRelease(user)).toMatchObject({ version: APP_VERSION });
    // Plusieurs versions manquées : seule la dernière, celle de l'app.
    await seen(user.id, "0.0.1");
    expect((await pendingRelease(user))!.version).toBe(APP_VERSION);
    await markReleaseSeen(user);
    // Une autre session du même compte lit le même état.
    expect(await pendingRelease({ id: user.id })).toBeNull();
  });

  it("à jour, plus récente ou sans version notée : rien", async () => {
    const user = await createUser();
    for (const version of [APP_VERSION, "99.0.0", null, "pas-une-version"]) {
      await seen(user.id, version);
      expect(await pendingRelease(user)).toBeNull();
    }
  });
});
