// Numéro de version de develop (pnpm release:bump et release:set), sur ton
// poste. La version de référence est celle de package.json sur origin/main,
// c'est-à-dire la production : bump part d'elle, jamais de develop, et le
// relancer ne cumule pas. Écrit la version dans package.json, renomme la note
// jamais sortie (git mv) ou en crée une depuis le gabarit. Ni commit ni push.
// Tous les refus ont lieu avant la moindre écriture.
// Sans alias d'import : scripts/release-version.ts charge ce fichier avec Node.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, isVersion } from "../../lib/semver.ts";
import { RELEASES_DIR } from "./notes.ts";

export class VersionChangeError extends Error {}

export type Level = "patch" | "minor" | "major";
export const LEVELS: readonly Level[] = ["patch", "minor", "major"];

export type VersionRequest = { kind: "bump"; level: string } | { kind: "set"; version: string };

/** Gabarit d'une note neuve : le titre et la rubrique restent à remplir. */
export const NOTE_TEMPLATE = "title:\n\n## Nouveau\n";

export const FETCH_WARNING =
  "origin/main n'a pas pu être mis à jour : version de production lue en local";

export type VersionChange = {
  production: string;
  previous: string;
  next: string;
  note: string;
  /** `renamed` : la note jamais sortie, renommée ; `created` : depuis le gabarit ; `kept` : déjà en place. */
  noteAction: "renamed" | "created" | "kept";
  renamedFrom: string | null;
  /** Rien n'a changé : develop portait déjà cette version et sa note. */
  unchanged: boolean;
  /** Le fetch a échoué : origin/main lu tel qu'il est en local. */
  warning: string | null;
};

/** Met origin/main à jour ; faux sans réseau ou sans dépôt distant. */
export function fetchMain(cwd: string): boolean {
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", "main"], {
      cwd,
      stdio: "ignore",
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Version suivante, à partir de celle de la production. */
export function bumpVersion(production: string, level: Level): string {
  const [major, minor, patch] = production.split(".").map(Number) as [number, number, number];
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const notePath = (version: string) => `${RELEASES_DIR}/${version}.md`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Versions des notes d'une liste de chemins `content/releases/x.y.z.md`. */
function noteVersions(paths: string, dir: string): string[] {
  return paths
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${dir}/`) && p.endsWith(".md"))
    .map((p) => p.slice(dir.length + 1, -3))
    .filter(isVersion);
}

export function changeVersion(
  cwd: string,
  request: VersionRequest,
  { fetch = fetchMain }: { fetch?: (cwd: string) => boolean } = {},
): VersionChange {
  const refuse = (why: string): never => {
    throw new VersionChangeError(`Refusé : ${why}. Rien n'a été modifié.`);
  };

  // Demande : vérifiée avant même le réseau.
  if (request.kind === "bump" && !(LEVELS as readonly string[]).includes(request.level)) {
    refuse(`niveau « ${request.level} » inconnu, attendu patch, minor ou major`);
  }
  if (request.kind === "set" && !isVersion(request.version)) {
    refuse(`« ${request.version} » n'est pas une version de la forme X.Y.Z`);
  }

  const warning = fetch(cwd) ? null : FETCH_WARNING;
  try {
    git(cwd, "rev-parse", "--verify", "--quiet", "origin/main^{commit}");
  } catch {
    refuse("origin/main introuvable, impossible de lire la version de production");
  }
  let production = "";
  try {
    production = (JSON.parse(git(cwd, "show", "origin/main:package.json")) as { version?: string })
      .version!;
  } catch {
    refuse("package.json illisible sur origin/main");
  }
  if (!isVersion(production)) refuse(`version de production illisible (« ${production} »)`);

  const next =
    request.kind === "bump" ? bumpVersion(production, request.level as Level) : request.version;
  if (compareVersions(next, production) <= 0) {
    refuse(`${next} n'est pas plus récente que la production (${production})`);
  }
  const released = noteVersions(
    git(cwd, "ls-tree", "--name-only", "origin/main", `${RELEASES_DIR}/`),
    RELEASES_DIR,
  );
  if (released.includes(next)) refuse(`la note ${notePath(next)} existe déjà sur origin/main`);

  const tracked = noteVersions(git(cwd, "ls-files", "--", RELEASES_DIR), RELEASES_DIR);
  const unreleased = tracked.filter((v) => !released.includes(v));
  if (unreleased.length > 1) {
    refuse(
      `plusieurs notes jamais sorties (${unreleased.map(notePath).join(", ")}) : garde-en une seule`,
    );
  }
  const pending = unreleased[0] ?? null;
  const target = notePath(next);
  if (pending !== next && existsSync(join(cwd, target))) {
    refuse(`${target} existe déjà sans être suivie par git`);
  }

  const pkgFile = join(cwd, "package.json");
  const pkgSource = readFileSync(pkgFile, "utf8");
  const previous = (JSON.parse(pkgSource) as { version: string }).version;
  const versionLine = /^(\s*"version":\s*")[^"]*(")/m;
  if (!versionLine.test(pkgSource)) refuse("champ « version » introuvable dans package.json");

  // Écritures, une fois tout vérifié.
  if (previous !== next) {
    writeFileSync(pkgFile, pkgSource.replace(versionLine, `$1${next}$2`));
  }
  let noteAction: VersionChange["noteAction"] = "kept";
  if (pending && pending !== next) {
    git(cwd, "mv", notePath(pending), target);
    noteAction = "renamed";
  } else if (!pending) {
    writeFileSync(join(cwd, target), NOTE_TEMPLATE);
    // Ajoutée à l'index, comme une note renommée : une relance la retrouve.
    git(cwd, "add", "--", target);
    noteAction = "created";
  }
  return {
    production,
    previous,
    next,
    note: target,
    noteAction,
    renamedFrom: noteAction === "renamed" ? notePath(pending!) : null,
    unchanged: previous === next && noteAction === "kept",
    warning,
  };
}

/** Ce que le script affiche. */
export function versionChangeText(change: VersionChange): string {
  const note = {
    renamed: `${change.note} (renommée depuis ${change.renamedFrom}, contenu inchangé)`,
    created: `${change.note} (créée depuis le gabarit : title et rubrique à remplir)`,
    kept: `${change.note} (déjà en place)`,
  }[change.noteAction];
  const lines = [
    ...(change.warning ? [`Attention : ${change.warning}.`] : []),
    `Production (origin/main) : ${change.production}`,
    `develop : ${change.previous} → ${change.next}`,
    `Note : ${note}`,
  ];
  if (change.unchanged) {
    lines.push(`develop porte déjà ${change.next} et sa note : rien n'a changé.`);
  }
  lines.push("Modifie la note, puis pousse.");
  return lines.join("\n");
}
