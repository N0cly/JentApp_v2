import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/NOUVEAUTES.md, § Aperçu : preview.sh et release-preview.ts refusent de
// tourner hors validation. Docker est simulé.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function sh(envFile: string | null, ...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-preview-sh-"));
  dirs.push(dir);
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "val"));
  const calls = join(dir, "calls");
  writeFileSync(calls, "");
  writeFileSync(
    join(dir, "bin", "docker"),
    `#!/bin/sh\necho "$*" >> "${calls}"\n[ "$*" = "compose ps -q app" ] && echo cafe\nexit 0\n`,
  );
  chmodSync(join(dir, "bin", "docker"), 0o755);
  if (envFile !== null) writeFileSync(join(dir, "val", ".env"), envFile);
  let code = 0;
  let stderr = "";
  try {
    execFileSync("bash", ["deploy/validation/preview.sh", ...args], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
      },
      stdio: "pipe",
    });
  } catch (error) {
    code = (error as { status: number }).status;
    stderr = (error as { stderr: Buffer }).stderr.toString();
  }
  return { code, stderr, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
}

function script(env: Record<string, string>, ...args: string[]) {
  try {
    const stdout = execFileSync("node", ["scripts/release-preview.ts", ...args], {
      env: { NODE_ENV: "test", PATH: process.env.PATH, ...env },
      stdio: "pipe",
    }).toString();
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number; stdout: Buffer; stderr: Buffer };
    return { code: e.status, stdout: e.stdout.toString(), stderr: e.stderr.toString() };
  }
}

describe("preview.sh", () => {
  it("lance l'aperçu dans le conteneur de la validation, avec ses options", () => {
    const result = sh("APP_ENV=validation\n", "--push", "--version", "2.1.0");
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "compose ps -q app",
      "compose exec -T app node scripts/release-preview.ts --push --version 2.1.0",
    ]);
  });

  it.each([
    ["production", "APP_ENV=production\n"],
    ["APP_ENV absent", "POSTGRES_DB=jentapp\n"],
    ["pas de .env", null],
  ])("hors validation (%s) : refus, aucune commande Docker", (_, envFile) => {
    const result = sh(envFile, "--push");
    expect(result.code).not.toBe(0);
    expect(result.calls).toEqual([]);
  });
});

describe("release-preview.ts", () => {
  it.each([
    ["production", { APP_ENV: "production" }],
    ["APP_ENV absent", {}],
  ])("hors validation (%s) : refus avant toute lecture", (_, env) => {
    const result = script({ ...env, DATABASE_URL: "postgres://nulle-part/rien" }, "--push");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("validation");
    expect(result.stdout).toBe("");
  });

  it("version plus récente que l'image : refus", () => {
    const result = script(
      { APP_ENV: "validation", VALIDATION_KEEP_EMAILS: "moi@exemple.fr" },
      "--version",
      "99.0.0",
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("plus récente");
  });
});
