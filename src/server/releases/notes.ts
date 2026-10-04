// Notes de version (docs/VALIDATION.md, B.2) : un fichier par version dans
// content/releases/{version}.md. Deux lignes d'en-tête, une ligne vide, puis
// une liste de 1 à 6 lignes. Lu sans dépendance : le format est fixe.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareVersions, isVersion } from "@/lib/version";

export const RELEASES_DIR = "content/releases";
export const MAX_ITEMS = 6;

export type Release = { version: string; date: string; title: string; items: string[] };

export class ReleaseFormatError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Lit une note ; tout écart au format est une erreur qui dit où. */
export function parseRelease(version: string, source: string): Release {
  const fail = (why: string): never => {
    throw new ReleaseFormatError(`${RELEASES_DIR}/${version}.md : ${why}`);
  };
  if (!isVersion(version)) fail("nom de fichier qui n'est pas une version x.y.z");
  const lines = source.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const date = /^date: (.*)$/.exec(lines[0] ?? "")?.[1]?.trim() ?? "";
  if (!isCalendarDate(date)) fail("première ligne attendue « date: AAAA-MM-JJ »");
  const title = /^title: (.*)$/.exec(lines[1] ?? "")?.[1]?.trim() ?? "";
  if (!title) fail("deuxième ligne attendue « title: … », non vide");
  if (lines[2] !== "") fail("troisième ligne attendue vide");
  const list = lines.slice(3);
  if (list.length < 1 || list.length > MAX_ITEMS) fail(`liste de 1 à ${MAX_ITEMS} lignes attendue`);
  const items = list.map((line, i) => {
    const item = /^- (.*)$/.exec(line)?.[1]?.trim() ?? "";
    if (!item) fail(`ligne ${i + 4} attendue « - … », non vide`);
    return item;
  });
  return { version, date, title, items };
}

function releasesDir() {
  return join(process.cwd(), RELEASES_DIR);
}

/** Toutes les versions, la plus récente d'abord. */
export async function listReleases(): Promise<Release[]> {
  const dir = releasesDir();
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
export async function readRelease(version: string): Promise<Release | null> {
  if (!isVersion(version)) return null;
  try {
    return parseRelease(version, await readFile(join(releasesDir(), `${version}.md`), "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
