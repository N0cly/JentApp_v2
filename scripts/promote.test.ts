import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.10 : deploy.sh exige une étiquette explicite ;
// promote.sh reprend celle qui tourne en validation. Docker est simulé.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function sandbox(health = "healthy", image = "ghcr.io/n0cly/jentapp_v2:sha-abc1234") {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-promote-"));
  dirs.push(dir);
  for (const d of ["bin", "prod", "val"]) mkdirSync(join(dir, d));
  const marker = join(dir, "docker-called");
  writeFileSync(
    join(dir, "bin", "docker"),
    `#!/bin/sh
touch "${marker}"
case "$*" in
  "compose ps -q app") echo cafe ;;
  *State.Health.Status*) echo ${health} ;;
  *Config.Image*) echo ${image} ;;
  *) exit 1 ;;
esac
`,
  );
  chmodSync(join(dir, "bin", "docker"), 0o755);
  writeFileSync(join(dir, "prod", "deploy.sh"), `#!/bin/sh\necho "deploy $JENTAPP_TAG"\n`);
  chmodSync(join(dir, "prod", "deploy.sh"), 0o755);
  return { dir, marker };
}

function run(script: string, dir: string, extra: Record<string, string> = {}) {
  try {
    const stdout = execFileSync("bash", [script], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_DIR: join(dir, "prod"),
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
        ...extra,
      },
      stdio: "pipe",
    }).toString();
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number; stdout: Buffer; stderr: Buffer };
    return { code: e.status, stdout: e.stdout.toString(), stderr: e.stderr.toString() };
  }
}

describe("deploy.sh", () => {
  it.each([
    ["sans étiquette", {}],
    ["latest", { JENTAPP_TAG: "latest" }],
  ])("%s : refus, aucune commande Docker", (_, env) => {
    const { dir, marker } = sandbox();
    const result = run("deploy/deploy.sh", dir, env as Record<string, string>);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("étiquette explicite");
    expect(existsSync(marker)).toBe(false);
  });
});

describe("promote.sh", () => {
  it("lance deploy.sh avec l'étiquette qui tourne en validation", () => {
    const { dir } = sandbox();
    const result = run("deploy/promote.sh", dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("deploy sha-abc1234");
  });

  it("refuse une validation qui n'est pas saine ou une étiquette qui n'est pas sha-…", () => {
    for (const [health, image] of [
      ["unhealthy", "ghcr.io/n0cly/jentapp_v2:sha-abc1234"],
      ["healthy", "ghcr.io/n0cly/jentapp_v2:latest"],
    ] as const) {
      const { dir } = sandbox(health, image);
      const result = run("deploy/promote.sh", dir);
      expect(result.code).not.toBe(0);
      expect(result.stdout).not.toContain("deploy ");
    }
  });
});
