import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";

/** Lance un script de validation comme dans le conteneur, sur la base de test. */
async function run(script: string, args: string[], env: Record<string, string>) {
  const base = { ...process.env, APP_ENV: "", VALIDATION_KEEP_EMAILS: "" };
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [script, ...args], {
      env: { ...base, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

const emails = async () => (await getDb().select().from(users)).map((u) => u.email).sort();

describe("scripts/validation-scrub.ts", () => {
  beforeEach(resetDb);

  it("hors validation : refus, code non nul, rien ne change", async () => {
    await leagueWith(1);
    const before = await emails();
    for (const env of [{}, { APP_ENV: "production" }] as Record<string, string>[]) {
      const result = await run("scripts/validation-scrub.ts", [], env);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("validation");
    }
    expect(await emails()).toEqual(before);
  });

  it("en validation : nettoie et garde VALIDATION_KEEP_EMAILS", async () => {
    const ctx = await leagueWith(1);
    const result = await run("scripts/validation-scrub.ts", [], {
      APP_ENV: "validation",
      VALIDATION_KEEP_EMAILS: ctx.owner.email,
    });
    expect(result.code).toBe(0);
    expect(await emails()).toEqual([ctx.owner.email, "joueur-1@validation.invalid"].sort());
  });
});
