import { spawnSync } from "node:child_process";
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

// docs/AUTOMATISATION.md, A.4 : seule la forme sha-<7 hexadécimaux> passe ;
// tout le reste est refusé sans rien lancer. En pause, rien n'est déployé.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function ciDeploy(request: string | undefined, { paused = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-ci-deploy-"));
  dirs.push(dir);
  mkdirSync(join(dir, "val"));
  mkdirSync(join(dir, "bin"));
  const launched = join(dir, "launched");
  const messages = join(dir, "messages");
  writeFileSync(launched, "");
  writeFileSync(messages, "");
  writeFileSync(join(dir, "val", "deploy.sh"), `#!/bin/sh\necho "$JENTAPP_TAG" >> "${launched}"\n`);
  chmodSync(join(dir, "val", "deploy.sh"), 0o755);
  writeFileSync(join(dir, "bin", "notify"), `#!/bin/sh\nprintf '%s\\n' "$1" >> "${messages}"\n`);
  chmodSync(join(dir, "bin", "notify"), 0o755);
  writeFileSync(join(dir, "bin", "logger"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "bin", "logger"), 0o755);
  if (paused) writeFileSync(join(dir, "val", ".paused"), "");
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: `${join(dir, "bin")}:${process.env.PATH}`,
    JENTAPP_VALIDATION_DIR: join(dir, "val"),
    NOTIFY: join(dir, "bin", "notify"),
  };
  if (request !== undefined) env.SSH_ORIGINAL_COMMAND = request;
  const run = spawnSync("bash", ["deploy/validation/ci-deploy.sh"], { env, encoding: "utf8" });
  return {
    code: run.status,
    stderr: run.stderr,
    launched: readFileSync(launched, "utf8"),
    messages: readFileSync(messages, "utf8"),
  };
}

describe("ci-deploy.sh", () => {
  it("accepte sha-abc1234 et lance deploy.sh avec cette étiquette", () => {
    const result = ciDeploy("sha-abc1234");
    expect(result.code).toBe(0);
    expect(result.launched).toBe("sha-abc1234\n");
  });

  it.each([
    ["latest"],
    ["develop"],
    ["sha-abc1234;touch pwned"],
    ["sha-abc1234 && touch pwned"],
    ["$(touch pwned)"],
    ["sha-$(touch pwned)"],
    ["sha-abc1234`touch pwned`"],
    ["sha-abc1234 "],
    [" sha-abc1234"],
    ["sha-abc 234"],
    ["sha-abc1234\ntouch pwned"],
    ["sha-abc123"],
    ["sha-abc12345"],
    ["sha-abcdefg"],
    [""],
  ])("%j : refusé, rien n'est lancé", (request) => {
    const result = ciDeploy(request);
    expect(result.code).not.toBe(0);
    expect(result.launched).toBe("");
    expect(result.stderr).toContain("demande refusée");
    // La demande n'est jamais exécutée : aucune commande injectée n'a tourné.
    expect(existsSync("pwned")).toBe(false);
  });

  it("sans demande : refusé", () => {
    const result = ciDeploy(undefined);
    expect(result.code).not.toBe(0);
    expect(result.launched).toBe("");
  });

  it("en pause : pas de déploiement, un message", () => {
    const result = ciDeploy("sha-abc1234", { paused: true });
    expect(result.code).toBe(0);
    expect(result.launched).toBe("");
    expect(result.messages).toBe("VAL en pause · déploiement de sha-abc1234 ignoré\n");
  });
});
