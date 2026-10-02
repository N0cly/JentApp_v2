import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIZE = 256;
const ACCEPTED = new Set(["jpeg", "png", "webp"]);
/** Les photos sont servies par /avatars/{fichier}. */
export const AVATAR_PATH = "/avatars/";
const FILE_NAME = /^[0-9a-f-]{36}\.webp$/;

export const photoMessages = {
  tooLarge: "Photo trop lourde : 5 Mo au plus.",
  badFormat: "Format refusé : JPEG, PNG ou WebP.",
} as const;

function avatarsDir(): string {
  return join(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"), "avatars");
}

export type PhotoResult = { ok: true; image: string } | { ok: false; error: string };

/**
 * Photo de profil : JPEG, PNG ou WebP, 5 Mo au plus. Recadrée en carré de
 * 256 px, convertie en WebP, sans métadonnées. Nom aléatoire ; l'ancienne
 * photo est supprimée.
 */
export async function saveProfilePhoto(userId: string, data: Uint8Array): Promise<PhotoResult> {
  if (data.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: photoMessages.tooLarge };
  if (data.byteLength === 0) return { ok: false, error: photoMessages.badFormat };

  let output: Buffer;
  try {
    // Le format se lit dans le contenu, pas dans le type annoncé.
    const format = (await sharp(data).metadata()).format;
    if (!format || !ACCEPTED.has(format)) return { ok: false, error: photoMessages.badFormat };
    output = await sharp(data, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: photoMessages.badFormat };
  }

  const name = `${randomUUID()}.webp`;
  await mkdir(avatarsDir(), { recursive: true });
  await writeFile(join(avatarsDir(), name), output);

  const [previous] = await getDb()
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, userId));
  const image = `${AVATAR_PATH}${name}`;
  await getDb().update(users).set({ image }).where(eq(users.id, userId));
  await deletePhotoFile(previous?.image ?? null);
  return { ok: true, image };
}

/** Supprime le fichier d'une photo servie par l'app. */
export async function deletePhotoFile(image: string | null): Promise<void> {
  const name = image?.startsWith(AVATAR_PATH) ? image.slice(AVATAR_PATH.length) : null;
  if (name && FILE_NAME.test(name)) await rm(join(avatarsDir(), name), { force: true });
}

/** Contenu d'une photo, ou null si le nom n'est pas celui d'une photo. */
export async function readPhoto(name: string): Promise<Buffer | null> {
  if (!FILE_NAME.test(name)) return null;
  try {
    return await readFile(join(avatarsDir(), name));
  } catch {
    return null;
  }
}
