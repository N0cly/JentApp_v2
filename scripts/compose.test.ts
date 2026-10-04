import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md : le compose paramétré donne, sans les variables de la
// validation, exactement la configuration de production d'avant. Comparé avec
// la même version de Docker Compose ; sauté sans Docker.
const hasCompose = (() => {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** `docker compose config` dans un dossier neuf, comme /opt/jentapp, sans l'environnement du poste. */
function config(
  files: Record<string, string>,
  env: Record<string, string> = {},
  args: string[] = [],
): string {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-compose-"));
  dirs.push(dir);
  for (const [to, from] of Object.entries(files)) copyFileSync(from, join(dir, to));
  return execFileSync("docker", ["compose", "config", ...args], {
    cwd: dir,
    env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
  });
}

describe.skipIf(!hasCompose)("compose de production", () => {
  it("identique à celui d'avant le paramétrage, avec ou sans étiquette", () => {
    const before = "scripts/fixtures/docker-compose.production-before.yml";
    for (const env of [{}, { JENTAPP_TAG: "sha-abc1234" }] as Record<string, string>[]) {
      expect(
        config(
          { "docker-compose.yml": "deploy/docker-compose.yml", ".env": "deploy/.env.example" },
          env,
        ),
      ).toBe(config({ "docker-compose.yml": before, ".env": "deploy/.env.example" }, env));
    }
  });
});

type Port = { host_ip?: string; target: number; published: string };
type Service = { environment: Record<string, string>; ports?: Port[] };
type ComposeConfig = { name: string; services: Record<string, Service> };

describe.skipIf(!hasCompose)("compose de validation", () => {
  it("APP_ENV, port 3100, Mailpit local, emails jamais réels, projet à part", () => {
    const out = JSON.parse(
      config(
        {
          "docker-compose.yml": "deploy/docker-compose.yml",
          "docker-compose.override.yml": "deploy/validation/docker-compose.override.yml",
          ".env": "deploy/validation/.env.example",
        },
        { JENTAPP_TAG: "sha-abc1234" },
        ["--format", "json"],
      ),
    ) as ComposeConfig;
    const { app, mailpit } = out.services as { app: Service; mailpit: Service };
    expect(out.name).toBe("jentapp-validation");
    expect(app.environment).toMatchObject({
      APP_ENV: "validation",
      SIGNUPS: "closed",
      APP_URL: "https://val.jentapp.nocly.fr",
      SETTLE_DELAY_SECONDS: "60",
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
      SMTP_PASSWORD: "",
    });
    expect(app.ports).toMatchObject([{ host_ip: "127.0.0.1", target: 3000, published: "3100" }]);
    expect(mailpit.ports).toMatchObject([
      { host_ip: "127.0.0.1", target: 8025, published: "8025" },
    ]);
  });
});
