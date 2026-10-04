import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/AUTOMATISATION.md, A.3 : une sauvegarde de plus de 26 heures déclenche
// l'alerte ; une récente, non.
const HOUR = 60 * 60 * 1000;
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function check(ageHours: number[]) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-backup-check-"));
  dirs.push(dir);
  mkdirSync(join(dir, "backups"));
  ageHours.forEach((age, i) => {
    const file = join(dir, "backups", `jentapp-2026-10-0${i + 1}.dump`);
    writeFileSync(file, "x");
    const time = new Date(Date.now() - age * HOUR);
    utimesSync(file, time, time);
  });
  const messages = join(dir, "messages");
  writeFileSync(messages, "");
  writeFileSync(join(dir, "notify"), `#!/bin/sh\nprintf '%s\\n' "$1" >> "${messages}"\n`);
  chmodSync(join(dir, "notify"), 0o755);
  const run = spawnSync("bash", ["deploy/backup/check.sh"], {
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      BACKUP_DIR: join(dir, "backups"),
      NOTIFY: join(dir, "notify"),
    },
    encoding: "utf8",
  });
  return { code: run.status, messages: readFileSync(messages, "utf8") };
}

describe("backup/check.sh", () => {
  it("sauvegarde récente : pas d'alerte", () => {
    const result = check([30, 2]);
    expect(result.code).toBe(0);
    expect(result.messages).toBe("");
  });

  it("plus de 26 heures : alerte avec la date de la dernière", () => {
    const result = check([50, 27]);
    expect(result.code).toBe(1);
    expect(result.messages).toMatch(
      /^SAUVEGARDE MANQUANTE · la dernière date du \d\d\/\d\d à \d\d:\d\d\n$/,
    );
  });

  it("aucune sauvegarde : alerte", () => {
    const result = check([]);
    expect(result.code).toBe(1);
    expect(result.messages).toContain("SAUVEGARDE MANQUANTE · aucune sauvegarde");
  });
});
