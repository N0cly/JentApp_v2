import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Fichiers des stickers : uploads/stickers/{ligue}/{empreinte}.webp
// (docs/STICKERS.md). Le nom est l'empreinte du contenu : un même sticker
// n'est stocké qu'une fois par ligue.

const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Le nom d'un sticker : une empreinte SHA-256 en hexadécimal, rien d'autre. */
export function isStickerHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

export function stickersRoot(): string {
  return join(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"), "stickers");
}

function leagueDir(leagueId: string): string {
  if (!UUID.test(leagueId)) throw new Error(`Identifiant de ligue invalide : ${leagueId}`);
  return join(stickersRoot(), leagueId);
}

function stickerPath(leagueId: string, hash: string): string {
  if (!isStickerHash(hash)) throw new Error("Empreinte de sticker invalide");
  return join(leagueDir(leagueId), `${hash}.webp`);
}

/** Écrit le sticker s'il n'existe pas encore ; un fichier n'est jamais vu à moitié écrit. */
export async function writeStickerFile(leagueId: string, hash: string, data: Buffer) {
  const path = stickerPath(leagueId, hash);
  try {
    await stat(path);
    return;
  } catch {
    // Absent : on l'écrit.
  }
  await mkdir(leagueDir(leagueId), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

/** Contenu d'un sticker, ou null si le nom n'est pas une empreinte ou si le fichier manque. */
export async function readStickerFile(leagueId: string, hash: string): Promise<Buffer | null> {
  if (!isStickerHash(hash) || !UUID.test(leagueId)) return null;
  try {
    return await readFile(stickerPath(leagueId, hash));
  } catch {
    return null;
  }
}
