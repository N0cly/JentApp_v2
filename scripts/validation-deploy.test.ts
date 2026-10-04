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

function deploy(envFile: string, extra: Record<string, string> = {}, health = "healthy") {
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
  *State.Health.Status*) echo ${health} ;;
  "compose logs --no-color --tail 15 app") echo "ligne de journal de l'app" ;;
  *) ;;
esac
`,
  );
  chmodSync(join(dir, "bin", "docker"), 0o755);
  writeFileSync(join(dir, "val", ".env"), envFile);
  const messages = join(dir, "messages");
  writeFileSync(messages, "");
  writeFileSync(
    join(dir, "bin", "notify"),
    `#!/bin/sh\nprintf '%s\\n---\\n' "$1" >> "${messages}"\n`,
  );
  chmodSync(join(dir, "bin", "notify"), 0o755);
  let code = 0;
  let stderr = "";
  try {
    execFileSync("bash", ["deploy/validation/deploy.sh"], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
        NOTIFY: join(dir, "bin", "notify"),
        HEALTH_TIMEOUT: "0",
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
  return {
    code,
    stderr,
    calls: lines,
    env: readFileSync(join(dir, "val", ".env"), "utf8"),
    messages: readFileSync(messages, "utf8").split("\n---\n").filter(Boolean),
  };
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
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatch(/^VAL ÉCHEC · \S+ · étape : contrôles$/);
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
    expect(result.messages).toEqual(["VAL déployée · develop · https://val.jentapp.nocly.fr"]);
  });

  it("en échec, prévient avec l'étape et les 15 dernières lignes du journal de l'app", () => {
    const result = deploy(VALID, { JENTAPP_TAG: "sha-abc1234" }, "unhealthy");
    expect(result.code).not.toBe(0);
    expect(result.messages).toEqual([
      "VAL ÉCHEC · sha-abc1234 · étape : healthcheck\nligne de journal de l'app",
    ]);
    expect(result.env).toContain("JENTAPP_TAG=sha-0000000");
  });

  it("prend l'étiquette donnée par JENTAPP_TAG", () => {
    const result = deploy(VALID, { JENTAPP_TAG: "sha-abc1234" });
    expect(result.code).toBe(0);
    expect(result.calls.every((c) => c.startsWith("sha-abc1234 "))).toBe(true);
    expect(result.env).toContain("JENTAPP_TAG=sha-abc1234\n");
  });
});
