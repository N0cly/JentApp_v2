import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_STICKER_BYTES, stickerMessages } from "@/lib/stickers";

export { MAX_STICKER_BYTES, stickerMessages };

// Traitement d'un sticker (docs/STICKERS.md, § Traitement). Le type annoncé par
// le navigateur ne compte pas : sharp décode le fichier et décide.

/** Au-delà, l'image est refusée avant d'être décodée : elle pourrait être piégée. */
export const MAX_INPUT_SIDE = 4096;
export const MAX_OUTPUT_SIDE = 512;
/** Au-delà, seule la première image d'une animation est gardée. */
export const MAX_FRAMES = 60;
const ACCEPTED = new Set(["png", "webp", "jpeg", "gif"]);

export type Sticker = {
  /** Empreinte SHA-256 du WebP produit : c'est son nom. */
  hash: string;
  width: number;
  height: number;
  bytes: number;
  data: Buffer;
};

export type ProcessResult = { ok: true; sticker: Sticker } | { ok: false; error: string };

/**
 * PNG, WebP, JPEG ou GIF de 5 Mo au plus et 4096 px de côté au plus, rendu en
 * WebP de 512 px au plus sur le grand côté, jamais agrandi, transparence
 * conservée, sans aucune métadonnée. Une animation de 60 images au plus est
 * conservée ; au-delà, seule la première reste.
 */
export async function processSticker(input: Uint8Array): Promise<ProcessResult> {
  if (input.byteLength > MAX_STICKER_BYTES) return { ok: false, error: stickerMessages.tooLarge };
  if (input.byteLength === 0) return { ok: false, error: stickerMessages.unreadable };

  let format: string | undefined;
  let width: number | undefined;
  let frameHeight: number | undefined;
  let frames: number;
  try {
    const meta = await sharp(input, { animated: true }).metadata();
    format = meta.format;
    width = meta.width;
    frameHeight = meta.pageHeight ?? meta.height;
    frames = meta.pages ?? 1;
  } catch {
    return { ok: false, error: stickerMessages.unreadable };
  }
  if (!format || !ACCEPTED.has(format)) return { ok: false, error: stickerMessages.badFormat };
  if (!width || !frameHeight) return { ok: false, error: stickerMessages.unreadable };
  if (width > MAX_INPUT_SIDE || frameHeight > MAX_INPUT_SIDE) {
    return { ok: false, error: stickerMessages.unreadable };
  }

  const animated = frames > 1 && frames <= MAX_FRAMES;
  try {
    // Sans withMetadata : EXIF (position GPS comprise), ICC et XMP disparaissent.
    const { data, info } = await sharp(input, animated ? { animated: true } : { pages: 1 })
      .autoOrient()
      .resize({
        width: MAX_OUTPUT_SIDE,
        height: MAX_OUTPUT_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      sticker: {
        hash: createHash("sha256").update(data).digest("hex"),
        width: info.width,
        height: info.pageHeight ?? info.height,
        bytes: data.byteLength,
        data,
      },
    };
  } catch {
    return { ok: false, error: stickerMessages.unreadable };
  }
}
