import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.8 : refresh.sh refuse de tourner hors validation, avant
// la moindre commande Docker. Un faux `docker` note tout appel.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function refresh(envFile: string | null, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-refresh-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  execFileSync("mkdir", ["-p", bin, join(dir, "val"), join(dir, "backups")]);
  const marker = join(dir, "docker-called");
  writeFileSync(join(bin, "docker"), `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
  chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(join(dir, "backups", "jentapp-2026-10-04.dump"), "x");
  writeFileSync(join(dir, "backups", "uploads-2026-10-04.tar.gz"), "x");
  if (envFile !== null) writeFileSync(join(dir, "val", ".env"), envFile);
  let code = 0;
  let stderr = "";
  try {
    execFileSync("bash", ["deploy/validation/refresh.sh"], {
      env: {
        NODE_ENV: "test",
        PATH: `${bin}:${process.env.PATH}`,
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
        BACKUP_DIR: join(dir, "backups"),
        ...extra,
      },
      stdio: "pipe",
    });
  } catch (error) {
    const e = error as { status: number; stderr: Buffer };
    code = e.status;
    stderr = e.stderr.toString();
  }
  return { code, stderr, dockerCalled: existsSync(marker) };
}

const VALID = "APP_ENV=validation\nJENTAPP_PROJECT=jentapp-validation\nJENTAPP_TAG=sha-abc1234\n";

describe("refresh.sh refuse de tourner hors validation", () => {
  it.each([
    ["sans .env", null],
    ["APP_ENV absent", "JENTAPP_PROJECT=jentapp-validation\nJENTAPP_TAG=sha-abc1234\n"],
    [
      "APP_ENV=production",
      "APP_ENV=production\nJENTAPP_PROJECT=jentapp-validation\nJENTAPP_TAG=sha-abc1234\n",
    ],
    [
      "projet de la production",
      "APP_ENV=validation\nJENTAPP_PROJECT=jentapp\nJENTAPP_TAG=sha-abc1234\n",
    ],
    ["sans étiquette", "APP_ENV=validation\nJENTAPP_PROJECT=jentapp-validation\n"],
    [
      "étiquette latest",
      "APP_ENV=validation\nJENTAPP_PROJECT=jentapp-validation\nJENTAPP_TAG=latest\n",
    ],
  ])("%s : refus, aucune commande Docker", (_, envFile) => {
    const result = refresh(envFile);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("rafraîchissement");
    expect(result.dockerCalled).toBe(false);
  });

  it("en validation, passe les gardes et va jusqu'à Docker", () => {
    const result = refresh(VALID);
    expect(result.dockerCalled).toBe(true);
  });
});
