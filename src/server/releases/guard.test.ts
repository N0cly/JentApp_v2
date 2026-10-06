import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/version";
import { releaseProblems } from "./notes";

// docs/VALIDATION.md, B.3, et docs/NOUVEAUTES.md, § Format : une version ne
// part pas sans ses notes. Ce test échoue tant que package.json porte une
// version sans fichier bien formé.
const GOOD = "title: Essai\n\n- Un point.\n";
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

  it.each([
    ["rubrique à un seul dièse", "title: Essai\n\n# Nouveau\n- Un point.\n"],
    ["élément de liste vide", "title: Essai\n\n## Nouveau\n- Un.\n- \n"],
    ["cinq rubriques", `title: Essai\n\n${"## R\n- Un.\n".repeat(5)}`],
    ["titre de rubrique de 31 caractères", `title: Essai\n\n## ${"r".repeat(31)}\n- Un.\n`],
    ["13 lignes", `title: Essai\n\n${"- Un point.\n".repeat(13)}`],
    ["titre de 61 caractères", `title: ${"t".repeat(61)}\n\n- Un point.\n`],
  ])("fichier mal formé, %s : la garde échoue", async (_, content) => {
    const dir = releasesWith({ "2.0.0.md": GOOD, "2.1.0.md": content });
    const problems = await releaseProblems("2.1.0", dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("2.1.0.md");
  });

  it("sans rubrique, avec rubriques libres, avec push et intro : la garde passe", async () => {
    const rich =
      "title: Essai\npush: Ouvre l'app.\nintro: Une phrase.\n\n## Soon !\n- Un.\n\n## Nouveau\n- Deux.\n";
    const dir = releasesWith({ "2.0.0.md": GOOD, "2.1.0.md": rich });
    expect(await releaseProblems("2.1.0", dir)).toEqual([]);
  });
});
