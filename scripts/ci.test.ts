import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/VALIDATION.md, A.0 : develop publie `sha-…` et `develop` ; main ne
// reconstruit rien et étiquette `latest` l'image existante du commit, ou échoue.
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Bloc d'un job, de sa ligne `  name:` à celle du job suivant. */
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThan(-1);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

/** Le script `run: |` de l'étape `- id: <step>` du job, désindenté. */
function stepScript(jobName: string, step: string): string {
  const lines = job(jobName).split("\n");
  const from = lines.findIndex((l) => l.trim() === `- id: ${step}`);
  const run = lines.findIndex((l, i) => i > from && l.trim() === "run: |");
  const indent = (lines[run + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

function tagLatest(existing: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-ci-"));
  dirs.push(dir);
  const calls = join(dir, "calls");
  writeFileSync(calls, "");
  writeFileSync(
    join(dir, "docker"),
    `#!/bin/sh
echo "$*" >> "${calls}"
case "$*" in
  "buildx imagetools inspect"*) exit ${existing ? 0 : 1} ;;
esac
`,
  );
  chmodSync(join(dir, "docker"), 0o755);
  writeFileSync(join(dir, "run.sh"), stepScript("latest", "tag-latest"));
  let code = 0;
  let stdout = "";
  try {
    stdout = execFileSync("bash", ["-e", join(dir, "run.sh")], {
      env: {
        NODE_ENV: "test",
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "N0cly/JentApp_v2",
        GITHUB_SHA: "abc1234def5678abc1234def5678abc1234def56",
      },
      stdio: "pipe",
    }).toString();
  } catch (error) {
    const e = error as { status: number; stdout: Buffer };
    code = e.status;
    stdout = e.stdout.toString();
  }
  return { code, stdout, calls: readFileSync(calls, "utf8").trim().split("\n") };
}

describe("CI", () => {
  it("vérifie sur develop, sur main et sur les demandes de fusion", () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[develop, main\]/);
    expect(workflow).toMatch(/\n {2}pull_request:/);
    expect(job("check")).not.toContain("if:");
  });

  it("sur develop, construit l'image avec les étiquettes sha-… et develop", () => {
    const image = job("image");
    expect(image).toContain("github.ref == 'refs/heads/develop'");
    expect(image).toContain("docker/build-push-action");
    expect(image).toMatch(/type=raw,value=develop\n\s+type=sha\n/);
    expect(image).not.toContain("value=latest");
  });

  it("sur main, ne construit rien", () => {
    const latest = job("latest");
    expect(latest).toContain("github.ref == 'refs/heads/main'");
    expect(latest).not.toContain("build-push-action");
    expect(workflow.match(/build-push-action/g)).toHaveLength(1);
  });

  it("déploie la validation seulement sur un push sur develop, après l'image", () => {
    const deploy = job("deploy-validation");
    expect(deploy).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/develop'",
    );
    expect(deploy).toContain("needs: image");
    expect(deploy).toContain("environment: validation");
    expect(deploy).toContain("timeout-minutes: 10");
    expect(deploy).toMatch(
      /concurrency:\n\s+group: deploy-validation\n\s+cancel-in-progress: false\n\s+queue: max/,
    );
    expect(deploy).toContain('"sha-${GITHUB_SHA:0:7}"');
  });

  it("vérifie la clé d'hôte du VPS", () => {
    const deploy = job("deploy-validation");
    expect(deploy).toContain("-o StrictHostKeyChecking=yes");
    expect(deploy).toContain("UserKnownHostsFile=");
    expect(deploy).toContain("secrets.VALIDATION_SSH_KNOWN_HOSTS");
    expect(workflow).not.toMatch(/StrictHostKeyChecking=(no|accept-new)/);
  });

  it("aucun secret sur une demande de fusion", () => {
    const jobs = [...workflow.matchAll(/\n {2}([a-z-]+):\n/g)].map((m) => m[1] ?? "");
    for (const name of jobs) {
      const block = job(name);
      if (!block.includes("secrets.")) continue;
      expect(block, name).toMatch(/if: .*github\.event_name == 'push'/);
    }
  });

  it("sur main, étiquette latest l'image existante du commit", () => {
    const result = tagLatest(true);
    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "buildx imagetools inspect ghcr.io/n0cly/jentapp_v2:sha-abc1234",
      "buildx imagetools create --tag ghcr.io/n0cly/jentapp_v2:latest ghcr.io/n0cly/jentapp_v2:sha-abc1234",
    ]);
  });

  it("sur main, un commit sans image existante fait échouer la publication", () => {
    const result = tagLatest(false);
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain("n'est pas passé par develop");
    expect(result.calls.some((c) => c.includes("imagetools create"))).toBe(false);
  });

  it("prévient sur Telegram quand un job échoue, sur develop et main seulement", () => {
    const notify = job("notify-failure");
    expect(notify).toContain(
      "if: failure() && github.event_name == 'push' && (github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main')",
    );
    expect(notify).toContain("needs: [check, image, deploy-validation, latest]");
    expect(notify).toContain("secrets.TELEGRAM_BOT_TOKEN");
    expect(notify).toContain("secrets.TELEGRAM_CHAT_ID");
  });

  it("message : CI ÉCHEC · branche · commit court · titre · lien, jeton hors ligne de commande", () => {
    const dir = mkdtempSync(join(tmpdir(), "jentapp-ci-notify-"));
    dirs.push(dir);
    writeFileSync(
      join(dir, "curl"),
      `#!/bin/sh\ncat > "${dir}/config"\nfor a in "$@"; do printf '%s\\n' "$a"; done > "${dir}/args"\n`,
    );
    chmodSync(join(dir, "curl"), 0o755);
    writeFileSync(join(dir, "run.sh"), stepScript("notify-failure", "notify"));
    execFileSync("bash", ["-e", join(dir, "run.sh")], {
      env: {
        NODE_ENV: "test",
        PATH: `${dir}:${process.env.PATH}`,
        TELEGRAM_BOT_TOKEN: "123:secret",
        TELEGRAM_CHAT_ID: "42",
        BRANCH: "develop",
        GITHUB_SHA: "abc1234def5678abc1234def5678abc1234def56",
        COMMIT_MESSAGE: "feat: add stickers\n\nCo-Authored-By: someone",
        RUN_URL: "https://github.com/N0cly/JentApp_v2/actions/runs/1",
      },
    });
    const args = readFileSync(join(dir, "args"), "utf8");
    expect(args).toContain(
      "text=CI ÉCHEC · develop · abc1234 · feat: add stickers · https://github.com/N0cly/JentApp_v2/actions/runs/1\n",
    );
    expect(args).toContain("chat_id=42");
    expect(args).not.toContain("123:secret");
    expect(readFileSync(join(dir, "config"), "utf8")).toContain("/bot123:secret/sendMessage");
  });
});
