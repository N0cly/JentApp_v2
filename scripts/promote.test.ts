import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.11 : deploy.sh exige l'étiquette sha-… d'un commit ;
// promote.sh ne promeut l'image de la validation que si `latest` la désigne.
// Docker est simulé : chaque étiquette du registre donne un identifiant d'image.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const REVISION = "abc1234def5678abc1234def5678abc1234def56";
const REPO = "ghcr.io/n0cly/jentapp_v2";

interface Registry {
  health?: string;
  running?: string;
  revision?: string;
  latest?: string;
  sha?: string;
}

function sandbox({
  health = "healthy",
  running = "sha256:validated",
  revision = REVISION,
  latest = "sha256:validated",
  sha = "sha256:validated",
}: Registry = {}) {
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
  *"{{.Image}}"*) echo ${running} ;;
  *Config.Image*) echo ${REPO}:develop ;;
  *Labels*) echo ${revision} ;;
  "pull -q "*) ;;
  *"{{.Id}}"*:latest) echo ${latest} ;;
  *"{{.Id}}"*:sha-${REVISION.slice(0, 7)}) echo ${sha} ;;
  *) exit 1 ;;
esac
`,
  );
  chmodSync(join(dir, "bin", "docker"), 0o755);
  writeFileSync(join(dir, "prod", "deploy.sh"), `#!/bin/sh\necho "deploy $JENTAPP_TAG"\n`);
  chmodSync(join(dir, "prod", "deploy.sh"), 0o755);
  writeFileSync(join(dir, "messages"), "");
  writeFileSync(
    join(dir, "bin", "notify"),
    `#!/bin/sh\nprintf '%s\\n---\\n' "$1" >> "${join(dir, "messages")}"\n`,
  );
  chmodSync(join(dir, "bin", "notify"), 0o755);
  return { dir, marker };
}

const messages = (dir: string) =>
  readFileSync(join(dir, "messages"), "utf8").split("\n---\n").filter(Boolean);

/** Production qui tourne sur sha-1111111 ; faux Docker pour tout le déploiement. */
function production(health: string) {
  const { dir } = sandbox();
  writeFileSync(join(dir, "prod", ".env"), "POSTGRES_DB=jentapp\nJENTAPP_TAG=sha-1111111\n");
  writeFileSync(
    join(dir, "bin", "docker"),
    `#!/bin/sh
case "$*" in
  "compose ps --status running -q db") ;;
  "compose ps -q app") echo cafe ;;
  *State.Health.Status*) echo ${health} ;;
  *package.json*) echo 2.1.0 ;;
  *) ;;
esac
`,
  );
  return dir;
}

function run(script: string, dir: string, extra: Record<string, string> = {}) {
  try {
    const stdout = execFileSync("bash", [script], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_DIR: join(dir, "prod"),
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
        NOTIFY: join(dir, "bin", "notify"),
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
    ["develop", { JENTAPP_TAG: "develop" }],
  ])("%s : refus, aucune commande Docker", (_, env) => {
    const { dir, marker } = sandbox();
    const result = run("deploy/deploy.sh", dir, env as Record<string, string>);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("étiquette explicite");
    expect(existsSync(marker)).toBe(false);
    expect(messages(dir)).toEqual([
      "PROD ÉCHEC · étape : contrôles\nRien n'a changé en production.",
    ]);
  });

  it("en succès, annonce la version en ligne et l'étiquette", () => {
    const dir = production("healthy");
    const result = run("deploy/deploy.sh", dir, { JENTAPP_TAG: "sha-abc1234" });
    expect(result.code).toBe(0);
    expect(messages(dir)).toEqual(["PROD · JentApp 2.1.0 en ligne · sha-abc1234"]);
  });

  it("en échec après le redémarrage, rappelle la commande de retour arrière", () => {
    const dir = production("unhealthy");
    const result = run("deploy/deploy.sh", dir, {
      JENTAPP_TAG: "sha-abc1234",
      HEALTH_TIMEOUT: "0",
    });
    expect(result.code).not.toBe(0);
    const [message] = messages(dir);
    expect(message).toContain("PROD ÉCHEC · étape : healthcheck");
    expect(message).toContain(`JENTAPP_TAG=sha-1111111 ${join(dir, "prod")}/deploy.sh`);
  });
});

describe("promote.sh", () => {
  it("lance deploy.sh avec l'étiquette du commit qui tourne en validation", () => {
    const { dir } = sandbox();
    const result = run("deploy/promote.sh", dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("deploy sha-abc1234");
  });

  it("s'arrête si latest ne désigne pas l'image qui tourne en validation", () => {
    const { dir } = sandbox({ latest: "sha256:other" });
    const result = run("deploy/promote.sh", dir);
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain("deploy ");
    expect(result.stderr).toContain("ne désigne pas l'image qui tourne en validation");
    expect(result.stderr).toContain("git merge --ff-only develop");
    expect(messages(dir)).toEqual([
      "PROD ÉCHEC · étape : vérification de latest\nRien n'a changé en production.",
    ]);
  });

  it.each([
    ["validation pas saine", { health: "unhealthy" }],
    ["image sans commit", { revision: "" }],
    ["étiquette sha-… reconstruite depuis", { sha: "sha256:rebuilt" }],
  ])("%s : refus", (_, registry) => {
    const { dir } = sandbox(registry);
    const result = run("deploy/promote.sh", dir);
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain("deploy ");
  });
});
