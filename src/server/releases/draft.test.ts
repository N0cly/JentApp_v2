import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { groupCommits, releaseDraft } from "./draft";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Un dépôt jetable : chaque étape est un commit, `version` change package.json. */
function repo(steps: ({ version: string; description?: string } | string)[]) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-draft-"));
  dirs.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      stdio: "pipe",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@exemple.fr",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@exemple.fr",
        GIT_CONFIG_NOSYSTEM: "1",
        HOME: dir,
      },
    });
  git("init", "-q");
  let n = 0;
  for (const step of steps) {
    n += 1;
    if (typeof step === "string") {
      writeFileSync(join(dir, `f${n}.txt`), String(n));
      git("add", "-A");
      git("commit", "-q", "-m", step);
    } else {
      const pkg = { name: "jentapp", version: step.version, description: step.description };
      writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
      git("add", "-A");
      git("commit", "-q", "-m", `chore: release ${step.version}`);
    }
  }
  return dir;
}

describe("brouillon de note", () => {
  it("groupe par type : feat, fix, autres", () => {
    const groups = groupCommits([
      { hash: "a", subject: "feat: send stickers" },
      { hash: "b", subject: "fix(chat)!: keep the scroll" },
      { hash: "c", subject: "docs: explain stickers" },
      { hash: "d", subject: "Merge branch develop" },
    ]);
    expect(groups).toEqual({
      feat: [{ hash: "a", subject: "send stickers" }],
      fix: [{ hash: "b", subject: "keep the scroll" }],
      other: [
        { hash: "c", subject: "docs: explain stickers" },
        { hash: "d", subject: "Merge branch develop" },
      ],
    });
  });

  it("commits depuis le dernier changement de version de package.json", () => {
    const dir = repo([
      { version: "2.0.0" },
      "feat: before 2.1.0",
      { version: "2.1.0" },
      "feat: send stickers",
      "fix: keep the scroll",
      "docs: explain stickers",
    ]);
    const text = releaseDraft(dir);
    expect(text).toContain("passage à 2.1.0");
    expect(text).toContain("3 commits");
    expect(text).toMatch(/feat\n {2}- send stickers \([0-9a-f]+\)\n\nfix\n {2}- keep the scroll/);
    expect(text).toContain("autres\n  - docs: explain stickers");
    expect(text).not.toContain("before 2.1.0");
  });

  it("une modification de package.json sans changement de version ne compte pas", () => {
    const dir = repo([
      { version: "2.1.0" },
      "feat: send stickers",
      { version: "2.1.0", description: "Carnet de paris" },
    ]);
    expect(releaseDraft(dir)).toContain("send stickers");
  });

  it("n'écrit rien dans le dépôt", () => {
    const dir = repo([{ version: "2.1.0" }, "feat: send stickers"]);
    const before = readdirSync(dir).sort();
    releaseDraft(dir);
    expect(readdirSync(dir).sort()).toEqual(before);
  });
});
