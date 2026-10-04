import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/AUTOMATISATION.md, A.1 : notify.sh n'échoue jamais et ne montre jamais
// le jeton. Aucun appel réel : un faux `curl` note sa configuration et ses
// arguments, et répond ce qu'on lui dit.
const TOKEN = "123456:SECRET-token-for-tests";
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function notify(text: string, options: { config?: string | null; curl?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-notify-"));
  dirs.push(dir);
  mkdirSync(join(dir, "bin"));
  const config = join(dir, "notify.env");
  const { config: content = `TELEGRAM_BOT_TOKEN=${TOKEN}\nTELEGRAM_CHAT_ID=42\n` } = options;
  if (content !== null) writeFileSync(config, content);
  const calls = join(dir, "calls");
  writeFileSync(
    join(dir, "bin", "curl"),
    `#!/bin/sh
cat > "${calls}.config"
for arg in "$@"; do printf '%s\\n' "$arg"; done > "${calls}.args"
${options.curl ?? `echo '{"ok":true,"result":{}}'`}
`,
  );
  chmodSync(join(dir, "bin", "curl"), 0o755);
  // Ni logger ni iconv réels : seul ce que le script écrit compte.
  writeFileSync(join(dir, "bin", "logger"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "bin", "logger"), 0o755);
  // stdout et stderr ensemble : le journal de notify.sh part sur stderr.
  const run = spawnSync("bash", ["deploy/notify.sh", text], {
    env: {
      NODE_ENV: "test",
      PATH: `${join(dir, "bin")}:/usr/bin:/bin`,
      NOTIFY_ENV: config,
      LANG: "en_US.UTF-8",
    },
    encoding: "utf8",
  });
  const result = { code: run.status, output: run.stdout + run.stderr };
  const read = (file: string) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
  return { ...result, curlConfig: read(`${calls}.config`), curlArgs: read(`${calls}.args`) };
}

describe("notify.sh", () => {
  it("envoie le texte brut au chat configuré, jeton hors de la ligne de commande", () => {
    const result = notify("VAL déployée · sha-abc1234");
    expect(result.code).toBe(0);
    expect(result.output).toBe("");
    expect(result.curlConfig).toContain(`/bot${TOKEN}/sendMessage`);
    expect(result.curlArgs).toContain("chat_id=42");
    expect(result.curlArgs).toContain("text=VAL déployée · sha-abc1234");
    expect(result.curlArgs).not.toContain(TOKEN);
    expect(result.curlArgs).not.toContain("parse_mode");
  });

  it("coupe le texte à 3500 caractères", () => {
    const result = notify("é".repeat(4000));
    const text = result.curlArgs?.split("\n").find((l) => l.startsWith("text="));
    expect(text).toBe(`text=${"é".repeat(3500)}`);
  });

  it.each([
    ["sans fichier de configuration", null],
    ["configuration incomplète", "TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=42\n"],
  ])("%s : code 0, une ligne au journal, rien n'est envoyé", (_, config) => {
    const result = notify("message", { config });
    expect(result.code).toBe(0);
    expect(result.output).toContain("notify :");
    expect(result.curlConfig).toBeNull();
  });

  it("Telegram injoignable : code 0, jeton absent de la sortie", () => {
    const result = notify("message", {
      curl: `echo "curl: (7) Failed to connect to api.telegram.org/bot${TOKEN}/sendMessage" >&2; exit 7`,
    });
    expect(result.code).toBe(0);
    expect(result.output).toContain("Telegram injoignable");
    expect(result.output).not.toContain(TOKEN);
  });

  it("Telegram refuse : code 0, jeton absent de la sortie", () => {
    const result = notify("message", {
      curl: `echo '{"ok":false,"error_code":401,"description":"Unauthorized ${TOKEN}"}'`,
    });
    expect(result.code).toBe(0);
    expect(result.output).toContain("Telegram a refusé");
    expect(result.output).not.toContain(TOKEN);
  });
});
