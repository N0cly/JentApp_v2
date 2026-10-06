import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  bumpVersion,
  changeVersion,
  FETCH_WARNING,
  NOTE_TEMPLATE,
  VersionChangeError,
  versionChangeText,
} from "./version-change";

// pnpm release:bump et release:set, dans des dépôts jetables. Pas de réseau :
// le fetch est simulé, origin/main est une référence posée à la main.
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const NOTE = "title: Les stickers\n\n## Nouveau\n- Un point.\n";
const ok = () => true;

function gitIn(dir: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      HOME: dir,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@exemple.fr",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@exemple.fr",
    },
  });
}

function pkg(version: string) {
  return `{\n  "name": "jentapp",\n  "version": "${version}",\n  "private": true\n}\n`;
}

/**
 * Production en `main` (version et notes), commitée et posée en origin/main ;
 * puis develop : sa version et ses notes, commitées par-dessus.
 */
function repo({
  main = { version: "2.1.0", notes: ["2.0.0", "2.1.0"] },
  develop = { version: "2.1.0", notes: [] as string[] },
  origin = true,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-version-"));
  dirs.push(dir);
  mkdirSync(join(dir, "content", "releases"), { recursive: true });
  gitIn(dir, "init", "-q");
  const write = (version: string, notes: string[]) => {
    writeFileSync(join(dir, "package.json"), pkg(version));
    for (const v of notes) writeFileSync(join(dir, "content", "releases", `${v}.md`), NOTE);
    gitIn(dir, "add", "-A");
    gitIn(dir, "commit", "-q", "--allow-empty", "-m", `release ${version}`);
  };
  write(main.version, main.notes);
  if (origin) gitIn(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  write(develop.version, develop.notes);
  return dir;
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");
const status = (dir: string) => gitIn(dir, "status", "--porcelain");

describe("version suivante", () => {
  it("à partir de la production", () => {
    expect(bumpVersion("2.1.0", "patch")).toBe("2.1.1");
    expect(bumpVersion("2.1.3", "minor")).toBe("2.2.0");
    expect(bumpVersion("2.1.3", "major")).toBe("3.0.0");
  });
});

describe("release:bump et release:set", () => {
  it("bump : version écrite dans package.json, note créée depuis le gabarit, ni commit", () => {
    const dir = repo();
    const head = gitIn(dir, "rev-parse", "HEAD");
    const change = changeVersion(dir, { kind: "bump", level: "patch" }, { fetch: ok });
    expect(change).toMatchObject({
      production: "2.1.0",
      previous: "2.1.0",
      next: "2.1.1",
      note: "content/releases/2.1.1.md",
      noteAction: "created",
      unchanged: false,
      warning: null,
    });
    expect(read(dir, "package.json")).toBe(pkg("2.1.1"));
    expect(read(dir, "content/releases/2.1.1.md")).toBe(NOTE_TEMPLATE);
    expect(gitIn(dir, "rev-parse", "HEAD")).toBe(head);
  });

  it("relancer bump ne cumule pas : même version, note déjà en place", () => {
    const dir = repo();
    changeVersion(dir, { kind: "bump", level: "patch" }, { fetch: ok });
    const again = changeVersion(dir, { kind: "bump", level: "patch" }, { fetch: ok });
    expect(again).toMatchObject({ next: "2.1.1", noteAction: "kept", unchanged: true });
    expect(read(dir, "package.json")).toBe(pkg("2.1.1"));
    expect(versionChangeText(again)).toContain("rien n'a changé");
  });

  it("note jamais sortie : renommée avec git mv, contenu inchangé", () => {
    const dir = repo({ develop: { version: "2.1.1", notes: ["2.1.1"] } });
    writeFileSync(join(dir, "content/releases/2.1.1.md"), "title: À moi\n\n- Mon texte.\n");
    gitIn(dir, "commit", "-qam", "note");
    const change = changeVersion(dir, { kind: "bump", level: "minor" }, { fetch: ok });
    expect(change).toMatchObject({
      previous: "2.1.1",
      next: "2.2.0",
      noteAction: "renamed",
      renamedFrom: "content/releases/2.1.1.md",
    });
    expect(existsSync(join(dir, "content/releases/2.1.1.md"))).toBe(false);
    expect(read(dir, "content/releases/2.2.0.md")).toBe("title: À moi\n\n- Mon texte.\n");
    expect(status(dir)).toContain("R  content/releases/2.1.1.md -> content/releases/2.2.0.md");
  });

  it("set : une version précise, la note suit", () => {
    const dir = repo({ develop: { version: "2.1.1", notes: ["2.1.1"] } });
    const change = changeVersion(dir, { kind: "set", version: "3.0.0" }, { fetch: ok });
    expect(change).toMatchObject({ next: "3.0.0", noteAction: "renamed" });
    expect(read(dir, "package.json")).toBe(pkg("3.0.0"));
    expect(existsSync(join(dir, "content/releases/3.0.0.md"))).toBe(true);
  });

  it("le fetch passe avant la lecture : la production mise à jour sert de référence", () => {
    const dir = repo();
    const fetch = (cwd: string) => {
      // Simule un main plus récent sur GitHub : 2.2.0 est sortie entre-temps.
      gitIn(cwd, "checkout", "-q", "-b", "prod", "refs/remotes/origin/main");
      writeFileSync(join(cwd, "package.json"), pkg("2.2.0"));
      writeFileSync(join(cwd, "content/releases/2.2.0.md"), NOTE);
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "release 2.2.0");
      gitIn(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
      gitIn(cwd, "checkout", "-q", "-");
      return true;
    };
    expect(changeVersion(dir, { kind: "bump", level: "patch" }, { fetch })).toMatchObject({
      production: "2.2.0",
      next: "2.2.1",
    });
  });

  it("fetch en échec : continue avec origin/main local et prévient", () => {
    const dir = repo();
    const change = changeVersion(dir, { kind: "bump", level: "patch" }, { fetch: () => false });
    expect(change).toMatchObject({ next: "2.1.1", warning: FETCH_WARNING });
    expect(versionChangeText(change)).toContain(
      "origin/main n'a pas pu être mis à jour : version de production lue en local",
    );
  });

  it("affiche la production, l'ancienne et la nouvelle version, la note et le rappel", () => {
    const dir = repo();
    const text = versionChangeText(
      changeVersion(dir, { kind: "bump", level: "minor" }, { fetch: ok }),
    );
    expect(text.split("\n")).toEqual([
      "Production (origin/main) : 2.1.0",
      "develop : 2.1.0 → 2.2.0",
      "Note : content/releases/2.2.0.md (créée depuis le gabarit : title et rubrique à remplir)",
      "Modifie la note, puis pousse.",
    ]);
  });
});

describe("release:bump et release:set : refus, sans rien modifier", () => {
  it.each([
    ["version qui n'est pas X.Y.Z", { kind: "set", version: "2.2" }, {}, "forme X.Y.Z"],
    ["niveau inconnu", { kind: "bump", level: "huge" }, {}, "patch, minor ou major"],
    ["version égale à la production", { kind: "set", version: "2.1.0" }, {}, "pas plus récente"],
    [
      "version inférieure à la production",
      { kind: "set", version: "2.0.9" },
      {},
      "pas plus récente",
    ],
    [
      "note déjà sur origin/main",
      { kind: "set", version: "2.5.0" },
      { main: { version: "2.1.0", notes: ["2.1.0", "2.5.0"] } },
      "existe déjà sur origin/main",
    ],
    [
      "origin/main introuvable",
      { kind: "bump", level: "patch" },
      { origin: false },
      "origin/main introuvable",
    ],
    [
      "plusieurs notes jamais sorties",
      { kind: "bump", level: "patch" },
      { develop: { version: "2.1.0", notes: ["2.1.1", "2.2.0"] } },
      "plusieurs notes jamais sorties",
    ],
  ] as const)("%s", (_, request, setup, message) => {
    const dir = repo(setup as Parameters<typeof repo>[0]);
    const before = { pkg: read(dir, "package.json"), status: status(dir) };
    let error: unknown = null;
    try {
      changeVersion(dir, request, { fetch: ok });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VersionChangeError);
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).toContain("Rien n'a été modifié.");
    expect({ pkg: read(dir, "package.json"), status: status(dir) }).toEqual(before);
  });

  it("une note du même nom, non suivie par git : refus", () => {
    const dir = repo();
    writeFileSync(join(dir, "content/releases/2.1.1.md"), "brouillon");
    expect(() => changeVersion(dir, { kind: "bump", level: "patch" }, { fetch: ok })).toThrow(
      "sans être suivie",
    );
    expect(read(dir, "package.json")).toBe(pkg("2.1.0"));
  });
});

describe("scripts/release-version.ts", () => {
  it("sans réseau : avertit, lit origin/main en local, n'écrit ni commit ni push", () => {
    const dir = repo();
    // Un origin qui n'existe pas : le vrai git fetch échoue sans toucher au réseau.
    gitIn(dir, "remote", "add", "origin", join(dir, "absent.git"));
    const stdout = execFileSync(
      "node",
      [join(process.cwd(), "scripts/release-version.ts"), "bump", "patch"],
      {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
        env: { NODE_ENV: "test", PATH: process.env.PATH },
      },
    );
    expect(stdout).toContain(FETCH_WARNING);
    expect(stdout).toContain("develop : 2.1.0 → 2.1.1");
    expect(stdout).toContain("Modifie la note, puis pousse.");
    expect(read(dir, "package.json")).toBe(pkg("2.1.1"));
  });
});
