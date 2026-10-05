import { existsSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_FRAMES, processSticker, stickerMessages } from "./process";
import { isStickerHash, readStickerFile, stickersRoot, writeStickerFile } from "./files";

// docs/STICKERS.md, § Traitement et § Tests.
const LEAGUE = "6c1f0e2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function png(width: number, height: number, alpha = true) {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 242, g: 182, b: 50, alpha: 0.5 } : "#f2b632",
    },
  })
    .png()
    .toBuffer();
}

async function animatedGif(frames: number, width = 300, height = 200) {
  const colors = Array.from({ length: frames }, (_, i) => ({ r: (i * 37) % 256, g: 80, b: 160 }));
  const images = await Promise.all(
    colors.map((background) =>
      sharp({ create: { width, height, channels: 4, background } })
        .png()
        .toBuffer(),
    ),
  );
  return sharp(images, { join: { animated: true } })
    .gif()
    .toBuffer();
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-stickers-"));
});

describe("processSticker", () => {
  it("PNG de 480 px : WebP, transparence conservée, pas agrandi", async () => {
    const result = await processSticker(await png(480, 480));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.sticker.data).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 480, height: 480, hasAlpha: true });
    expect(result.sticker).toMatchObject({ width: 480, height: 480 });
    expect(result.sticker.bytes).toBe(result.sticker.data.byteLength);
    expect(isStickerHash(result.sticker.hash)).toBe(true);
  });

  it("photo de 4000 px : réduite à 512 px sur le grand côté, proportions conservées", async () => {
    const photo = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: "#123456" },
    })
      .jpeg()
      .toBuffer();
    const result = await processSticker(photo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sticker).toMatchObject({ width: 512, height: 384 });
    expect(await sharp(result.sticker.data).metadata()).toMatchObject({ width: 512, height: 384 });
  });

  it("JPEG avec position GPS : aucune métadonnée en sortie", async () => {
    const photo = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#888" },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: "secret-exif" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1" },
      })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const result = await processSticker(photo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.sticker.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(result.sticker.data.includes(Buffer.from("secret-exif"))).toBe(false);
  });

  it("le type annoncé ne compte pas : un fichier texte nommé .png est refusé", async () => {
    const result = await processSticker(Buffer.from("ceci n'est pas une image"));
    expect(result).toEqual({ ok: false, error: stickerMessages.unreadable });
  });

  it("SVG refusé", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>',
    );
    expect(await processSticker(svg)).toEqual({ ok: false, error: stickerMessages.badFormat });
  });

  it("autres formats décodables refusés", async () => {
    const tiff = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } })
      .tiff()
      .toBuffer();
    expect(await processSticker(tiff)).toEqual({ ok: false, error: stickerMessages.badFormat });
  });

  it("fichier de 6 Mo refusé", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    expect(await processSticker(big)).toEqual({ ok: false, error: stickerMessages.tooLarge });
  });

  it("image de 5000 px refusée", async () => {
    const result = await processSticker(await png(5000, 10, false));
    expect(result).toEqual({ ok: false, error: stickerMessages.unreadable });
  });

  it("image tronquée : illisible", async () => {
    const whole = await png(300, 300);
    const result = await processSticker(whole.subarray(0, 200));
    expect(result).toEqual({ ok: false, error: stickerMessages.unreadable });
  });

  it("GIF animé : animation conservée, chaque image réduite", async () => {
    const result = await processSticker(await animatedGif(3, 1000, 800));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.sticker.data, { animated: true }).metadata();
    expect(meta).toMatchObject({ format: "webp", pages: 3, width: 512, pageHeight: 410 });
    expect(result.sticker).toMatchObject({ width: 512, height: 410 });
  });

  it(`plus de ${MAX_FRAMES} images : seule la première est gardée`, async () => {
    const result = await processSticker(await animatedGif(MAX_FRAMES + 1, 40, 40));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.sticker.data, { animated: true }).metadata();
    expect(meta.pages ?? 1).toBe(1);
    expect(result.sticker).toMatchObject({ width: 40, height: 40 });
  });

  it("même image, même empreinte", async () => {
    const image = await png(100, 100);
    const [a, b] = await Promise.all([processSticker(image), processSticker(image)]);
    expect(a.ok && b.ok && a.sticker.hash === b.sticker.hash).toBe(true);
  });
});

describe("fichiers des stickers", () => {
  it("nommés par leur empreinte, écrits une seule fois par ligue", async () => {
    const result = await processSticker(await png(64, 64));
    if (!result.ok) throw new Error(result.error);
    const { hash, data } = result.sticker;
    await writeStickerFile(LEAGUE, hash, data);
    await writeStickerFile(LEAGUE, hash, data);
    expect(await readdir(join(stickersRoot(), LEAGUE))).toEqual([`${hash}.webp`]);
    expect(existsSync(join(stickersRoot(), LEAGUE, `${hash}.webp`))).toBe(true);
    expect((await readStickerFile(LEAGUE, hash))?.equals(data)).toBe(true);
  });

  it.each([
    ["../" + "a".repeat(61)],
    ["a".repeat(63)],
    ["A".repeat(64)],
    ["a".repeat(64) + ".webp"],
  ])("%s n'est pas une empreinte : rien n'est lu", async (name) => {
    expect(isStickerHash(name)).toBe(false);
    expect(await readStickerFile(LEAGUE, name)).toBeNull();
  });
});
