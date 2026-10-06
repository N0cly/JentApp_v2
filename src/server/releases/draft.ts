// Brouillon de note (docs/NOUVEAUTES.md, § Brouillon) : les commits depuis le
// dernier changement de version dans package.json, groupés par type. Une
// matière première pour écrire la note : rien n'est écrit dans content/releases.
// Sans alias d'import : scripts/release-draft.ts charge ce fichier avec Node.

import { execFileSync } from "node:child_process";

export type Commit = { hash: string; subject: string };
export type DraftGroups = { feat: Commit[]; fix: Commit[]; other: Commit[] };

const CONVENTIONAL = /^(\w+)(\([^)]*\))?!?: (.+)$/;

/** feat et fix sans leur préfixe ; le reste tel quel. */
export function groupCommits(commits: Commit[]): DraftGroups {
  const groups: DraftGroups = { feat: [], fix: [], other: [] };
  for (const commit of commits) {
    const match = CONVENTIONAL.exec(commit.subject);
    const type = match?.[1];
    if (type === "feat" || type === "fix") groups[type].push({ ...commit, subject: match![3]! });
    else groups.other.push(commit);
  }
  return groups;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function versionAt(cwd: string, rev: string): string | null {
  try {
    return (
      (JSON.parse(git(cwd, "show", `${rev}:package.json`)) as { version?: string }).version ?? null
    );
  } catch {
    return null;
  }
}

/** Le dernier commit qui a changé la version de package.json, et cette version. */
export function lastVersionChange(cwd: string): { hash: string; version: string } | null {
  const candidates = git(cwd, "log", "--format=%H", "-G", '"version"', "--", "package.json")
    .split("\n")
    .filter(Boolean);
  for (const hash of candidates) {
    const version = versionAt(cwd, hash);
    if (version && version !== versionAt(cwd, `${hash}^`)) return { hash, version };
  }
  return null;
}

/** Commits depuis ce changement de version, du plus ancien au plus récent, sans les fusions. */
export function commitsSince(cwd: string, hash: string | null): Commit[] {
  const range = hash ? [`${hash}..HEAD`] : ["HEAD"];
  return git(cwd, "log", "--reverse", "--no-merges", "--format=%h%x09%s", ...range)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [short, ...rest] = line.split("\t");
      return { hash: short!, subject: rest.join("\t") };
    });
}

export function draftText(since: { hash: string; version: string } | null, groups: DraftGroups) {
  const total = groups.feat.length + groups.fix.length + groups.other.length;
  const origin = since
    ? `depuis ${since.hash.slice(0, 7)}, passage à ${since.version}`
    : "depuis le début du dépôt";
  const lines = [
    `Brouillon ${origin} : ${total} commit${total > 1 ? "s" : ""}. Rien n'est écrit dans content/releases.`,
  ];
  const section = (name: string, commits: Commit[]) => {
    if (commits.length === 0) return;
    lines.push("", name);
    for (const c of commits) lines.push(`  - ${c.subject} (${c.hash})`);
  };
  section("feat", groups.feat);
  section("fix", groups.fix);
  section("autres", groups.other);
  return lines.join("\n");
}

export function releaseDraft(cwd = process.cwd()): string {
  const since = lastVersionChange(cwd);
  return draftText(since, groupCommits(commitsSince(cwd, since?.hash ?? null)));
}
