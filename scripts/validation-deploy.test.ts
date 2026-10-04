import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.10 : déploiement de tous les jours de la validation,
// jamais sur un autre environnement. Docker est simulé et note chaque appel
// avec l'étiquette qu'il reçoit.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const VALID = "APP_ENV=validation\nJENTAPP_PROJECT=jentapp-validation\nJENTAPP_TAG=sha-0000000\n";

function deploy(envFile: string, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-validation-deploy-"));
  dirs.push(dir);
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "val"));
  const calls = join(dir, "calls");
  writeFileSync(calls, "");
  writeFileSync(
    join(dir, "bin", "docker"),
    `#!/bin/sh
echo "$JENTAPP_TAG $*" >> "${calls}"
case "$*" in
  "compose ps -q app") echo cafe ;;
  *State.Health.Status*) echo healthy ;;
  *) ;;
esac
`,
  );
  chmodSync(join(dir, "bin", "docker"), 0o755);
  writeFileSync(join(dir, "val", ".env"), envFile);
  let code = 0;
  let stderr = "";
  try {
    execFileSync("bash", ["deploy/validation/deploy.sh"], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
        ...extra,
      },
      stdio: "pipe",
    });
  } catch (error) {
    const e = error as { status: number; stderr: Buffer };
    code = e.status;
    stderr = e.stderr.toString();
  }
  const lines = readFileSync(calls, "utf8").trim().split("\n").filter(Boolean);
  return { code, stderr, calls: lines, env: readFileSync(join(dir, "val", ".env"), "utf8") };
}

describe("validation/deploy.sh", () => {
  it.each([
    ["APP_ENV absent", "JENTAPP_PROJECT=jentapp-validation\n", {}],
    ["APP_ENV=production", "APP_ENV=production\nJENTAPP_PROJECT=jentapp-validation\n", {}],
    ["projet de la production", "APP_ENV=validation\nJENTAPP_PROJECT=jentapp\n", {}],
    ["étiquette latest", VALID, { JENTAPP_TAG: "latest" }],
  ])("%s : refus, aucune commande Docker", (_, envFile, extra) => {
    const result = deploy(envFile, extra as Record<string, string>);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("déploiement de la validation");
    expect(result.calls).toEqual([]);
  });

  it("tire develop par défaut, redémarre, contrôle le journal et note l'étiquette", () => {
    const result = deploy(VALID);
    expect(result.code).toBe(0);
    const commands = result.calls.map((c) => c.split(" ").slice(1).join(" "));
    expect(commands.indexOf("compose pull")).toBeLessThan(commands.indexOf("compose up -d"));
    expect(commands).toContain("compose exec -T app node scripts/ledger-check.ts");
    expect(result.calls.every((c) => c.startsWith("develop "))).toBe(true);
    expect(result.env).toContain("JENTAPP_TAG=develop\n");
    expect(result.env).not.toContain("sha-0000000");
  });

  it("prend l'étiquette donnée par JENTAPP_TAG", () => {
    const result = deploy(VALID, { JENTAPP_TAG: "sha-abc1234" });
    expect(result.code).toBe(0);
    expect(result.calls.every((c) => c.startsWith("sha-abc1234 "))).toBe(true);
    expect(result.env).toContain("JENTAPP_TAG=sha-abc1234\n");
  });
});
