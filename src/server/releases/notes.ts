// Notes de version (docs/NOUVEAUTES.md, § Format) : un fichier par version dans
// content/releases/{version}.md. Un en-tête `clé: valeur` (title obligatoire ;
// push, intro et date facultatifs), une ligne vide, puis une liste, avec ou
// sans rubriques « ## Nouveau », « ## Amélioré », « ## Corrigé », dans cet
// ordre. Texte brut : seul **gras** est interprété. Lu sans dépendance.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { displayLength } from "@/lib/release-text";
import { compareVersions, isVersion } from "@/lib/version";

export const RELEASES_DIR = "content/releases";
export const MAX_ITEMS = 12;
export const MAX_ITEM_LENGTH = 140;
export const MAX_TITLE_LENGTH = 60;
export const MAX_PUSH_LENGTH = 120;
export const MAX_INTRO_LENGTH = 200;

/** Rubriques admises, dans l'ordre où elles doivent paraître. */
export const RELEASE_HEADINGS = ["Nouveau", "Amélioré", "Corrigé"] as const;
export type ReleaseHeading = (typeof RELEASE_HEADINGS)[number];

/** Une rubrique ; `heading` vide pour une note sans rubrique, qui n'en a qu'une. */
export type ReleaseSection = { heading: ReleaseHeading | null; items: string[] };

export type Release = {
  version: string;
  title: string;
  /** Texte du push et de la notification ; vide, « JentApp {version} : {title} ». */
  push: string | null;
  intro: string | null;
  /** Date écrite dans le fichier ; sinon celle de la mise en ligne (§ Date). */
  date: string | null;
  sections: ReleaseSection[];
};

export class ReleaseFormatError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ["title", "push", "intro", "date"] as const;
type Field = (typeof FIELDS)[number];

function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Texte du push et de la notification de la version. */
export function releasePushText(release: Pick<Release, "version" | "title" | "push">): string {
  return release.push ?? `JentApp ${release.version} : ${release.title}`;
}

/** Lit une note ; tout écart au format est une erreur qui dit où. */
export function parseRelease(version: string, source: string): Release {
  const fail = (why: string): never => {
    throw new ReleaseFormatError(`${RELEASES_DIR}/${version}.md : ${why}`);
  };
  if (!isVersion(version)) fail("nom de fichier qui n'est pas une version x.y.z");
  const lines = source.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");

  // En-tête : jusqu'à la première ligne vide.
  const header: Partial<Record<Field, string>> = {};
  let n = 0;
  for (; n < lines.length && lines[n] !== ""; n++) {
    const match = /^([a-z]+):(.*)$/.exec(lines[n]!);
    if (!match) fail(`ligne ${n + 1} : en-tête attendu « clé: valeur »`);
    const [, key, raw] = match!;
    if (!(FIELDS as readonly string[]).includes(key!))
      fail(`ligne ${n + 1} : champ inconnu « ${key} »`);
    if (header[key as Field] !== undefined) fail(`ligne ${n + 1} : champ « ${key} » en double`);
    const value = raw!.trim();
    if (!value) fail(`ligne ${n + 1} : « ${key} » vide`);
    header[key as Field] = value;
  }
  if (n >= lines.length) fail("ligne vide attendue entre l'en-tête et la liste");

  const { title, push, intro, date } = header;
  if (!title) fail("« title » obligatoire");
  const limit = (name: string, value: string | undefined, max: number) => {
    if (value !== undefined && [...value].length > max) {
      fail(`« ${name} » : ${[...value].length} caractères, ${max} au plus`);
    }
  };
  limit("title", title, MAX_TITLE_LENGTH);
  limit("push", push, MAX_PUSH_LENGTH);
  limit("intro", intro, MAX_INTRO_LENGTH);
  if (date !== undefined && !isCalendarDate(date)) fail("« date » attendue au format AAAA-MM-JJ");

  // Corps : une liste, avec ou sans rubriques. Les lignes vides séparent.
  const sections: ReleaseSection[] = [];
  let count = 0;
  for (let i = n + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const at = `ligne ${i + 1}`;
    if (line.trim() === "") continue;
    const heading = /^## (.*)$/.exec(line)?.[1]?.trim();
    if (heading !== undefined) {
      const rank = (RELEASE_HEADINGS as readonly string[]).indexOf(heading);
      if (rank < 0)
        fail(`${at} : rubrique inconnue « ${heading} » (${RELEASE_HEADINGS.join(", ")})`);
      if (sections.length > 0 && sections[0]!.heading === null) {
        fail(`${at} : rubrique après une liste sans rubrique`);
      }
      const previous = sections.at(-1)?.heading;
      if (previous && RELEASE_HEADINGS.indexOf(previous) >= rank) {
        fail(`${at} : rubriques dans l'ordre ${RELEASE_HEADINGS.join(", ")}, chacune une fois`);
      }
      if (sections.length > 0 && sections.at(-1)!.items.length === 0) {
        fail(`${at} : rubrique « ${previous} » vide`);
      }
      sections.push({ heading: heading as ReleaseHeading, items: [] });
      continue;
    }
    const item = /^- (.*)$/.exec(line)?.[1]?.trim() ?? "";
    if (!item) fail(`${at} : attendu « - … », non vide, ou « ## Rubrique »`);
    if (item.split("**").length % 2 === 0) fail(`${at} : « ** » sans sa fermeture`);
    if (displayLength(item) > MAX_ITEM_LENGTH) {
      fail(`${at} : ${displayLength(item)} caractères, ${MAX_ITEM_LENGTH} au plus`);
    }
    if (sections.length === 0) sections.push({ heading: null, items: [] });
    sections.at(-1)!.items.push(item);
    count += 1;
  }
  if (count === 0) fail("liste vide");
  if (sections.at(-1)!.items.length === 0) fail(`rubrique « ${sections.at(-1)!.heading} » vide`);
  if (count > MAX_ITEMS) fail(`${count} lignes, ${MAX_ITEMS} au plus en tout`);

  return {
    version,
    title: title!,
    push: push ?? null,
    intro: intro ?? null,
    date: date ?? null,
    sections,
  };
}

function releasesDir() {
  return join(process.cwd(), RELEASES_DIR);
}

/**
 * Garde : ce qui empêcherait une version de partir. La version courante doit
 * avoir sa note, et chaque note doit être bien formée.
 */
export async function releaseProblems(version: string, dir = releasesDir()): Promise<string[]> {
  const problems: string[] = [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  if (!files.includes(`${version}.md`)) {
    problems.push(
      `${RELEASES_DIR}/${version}.md manquant pour la version ${version} de package.json`,
    );
  }
  for (const file of files) {
    try {
      parseRelease(file.slice(0, -3), await readFile(join(dir, file), "utf8"));
    } catch (error) {
      if (!(error instanceof ReleaseFormatError)) throw error;
      problems.push(error.message);
    }
  }
  return problems;
}

/** Toutes les versions, la plus récente d'abord. */
export async function listReleases(dir = releasesDir()): Promise<Release[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const releases = await Promise.all(
    files.map(async (file) => {
      const version = file.slice(0, -3);
      return parseRelease(version, await readFile(join(dir, file), "utf8"));
    }),
  );
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

/** La note d'une version, ou rien si elle n'existe pas. */
export async function readRelease(version: string, dir = releasesDir()): Promise<Release | null> {
  if (!isVersion(version)) return null;
  try {
    return parseRelease(version, await readFile(join(dir, `${version}.md`), "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
