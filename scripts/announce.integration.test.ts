import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";

const MESSAGE = "Maintenance ce soir à 23 h, coupure de 10 minutes.";

/** Lance le script comme dans le conteneur, sur la base de test. */
async function announce(...args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", ["scripts/announce.ts", ...args], {
      env: { ...process.env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

const count = async () => (await getDb().select().from(notifications)).length;

describe("scripts/announce.ts", () => {
  beforeEach(resetDb);

  it("sans --envoyer : aperçu, aucune ligne écrite", async () => {
    await leagueWith(2);
    const run = await announce(MESSAGE);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`Message : « ${MESSAGE} »`);
    expect(run.stdout).toContain("Destinataires : 3 comptes, dont 0 abonné au push.");
    expect(await count()).toBe(0);
  });

  it("--envoyer : une ligne par compte", async () => {
    await leagueWith(1);
    const run = await announce("--envoyer", MESSAGE);
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toBe("Annonce envoyée à 2 comptes, dont 0 abonné au push.");
    expect(await count()).toBe(2);
  });

  it("message vide, trop long ou absent : erreur, code non nul, rien d'écrit", async () => {
    await leagueWith(1);
    for (const args of [["--envoyer", ""], ["--envoyer", "x".repeat(201)], ["--envoyer"]]) {
      const run = await announce(...args);
      expect(run.code).not.toBe(0);
      expect(run.stderr).not.toBe("");
    }
    expect(await count()).toBe(0);
  });
});
