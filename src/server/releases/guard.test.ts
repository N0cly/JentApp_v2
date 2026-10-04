import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/version";
import { releaseProblems } from "./notes";

// docs/VALIDATION.md, B.3 : une version ne part pas sans ses notes. Ce test
// échoue tant que package.json porte une version sans fichier bien formé.
const GOOD = "date: 2026-10-10\ntitle: Essai\n\n- Un point.\n";
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function releasesWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-releases-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("garde des notes de version", () => {
  it(`la version ${APP_VERSION} de package.json a sa note, et toutes les notes sont bien formées`, async () => {
    expect(await releaseProblems(APP_VERSION)).toEqual([]);
  });

  it("version sans fichier : la garde échoue", async () => {
    const problems = await releaseProblems("2.1.0", releasesWith({ "2.0.0.md": GOOD }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("2.1.0.md manquant");
  });

  it("fichier mal formé : la garde échoue", async () => {
    const dir = releasesWith({ "2.0.0.md": GOOD, "2.1.0.md": "title: Sans date\n\n- Un point.\n" });
    expect(await releaseProblems("2.1.0", dir)).toHaveLength(1);
  });
});
