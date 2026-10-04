import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { APP_VERSION } from "@/lib/version";
import { signUp } from "@/server/auth/accounts";
import { resetDb } from "@/test/db";

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
});
