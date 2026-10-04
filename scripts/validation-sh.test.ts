import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.11 : marche et arrêt, jamais sur un autre environnement.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function run(envFile: string, ...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-validation-sh-"));
  dirs.push(dir);
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "val"));
  const calls = join(dir, "calls");
  writeFileSync(calls, "");
  writeFileSync(join(dir, "bin", "docker"), `#!/bin/sh\necho "$*" >> "${calls}"\n`);
  chmodSync(join(dir, "bin", "docker"), 0o755);
  writeFileSync(join(dir, "val", ".env"), envFile);
  let code = 0;
  try {
    execFileSync("bash", ["deploy/validation/validation.sh", ...args], {
      env: {
        NODE_ENV: "test",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        JENTAPP_VALIDATION_DIR: join(dir, "val"),
      },
      stdio: "pipe",
    });
  } catch (error) {
    code = (error as { status: number }).status;
  }
  return { code, calls: readFileSync(calls, "utf8").trim() };
}

const VALID = "APP_ENV=validation\nJENTAPP_TAG=sha-abc1234\n";

describe("validation.sh", () => {
  it("start, stop, status", () => {
    expect(run(VALID, "start")).toEqual({ code: 0, calls: "compose up -d --wait" });
    expect(run(VALID, "stop")).toEqual({ code: 0, calls: "compose stop" });
    expect(run(VALID, "status")).toEqual({ code: 0, calls: "compose ps" });
  });

  it("refuse hors validation, sans étiquette, ou sans commande", () => {
    expect(run("APP_ENV=production\nJENTAPP_TAG=sha-abc1234\n", "stop")).toEqual({
      code: 1,
      calls: "",
    });
    expect(run("APP_ENV=validation\n", "start")).toEqual({ code: 1, calls: "" });
    expect(run(VALID)).toEqual({ code: 1, calls: "" });
  });
});
