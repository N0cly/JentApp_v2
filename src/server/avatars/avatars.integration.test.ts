import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { MAX_PHOTO_BYTES, readPhoto, saveProfilePhoto } from ".";

const image = (format: "png" | "jpeg" | "webp" | "gif") =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: "#f2b632" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-exif" } } })
    .toFormat(format)
    .toBuffer();

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-uploads-"));
});

describe("photo de profil", () => {
  beforeEach(resetDb);

  it.each(["png", "jpeg", "webp"] as const)(
    "accepte le %s : carré de 256 px en WebP, sans métadonnées",
    async (format) => {
      const user = await createUser();
      const result = await saveProfilePhoto(user.id, await image(format));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const file = await readPhoto(result.image.replace("/avatars/", ""));
      const meta = await sharp(file!).metadata();
      expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
      expect(meta.exif).toBeUndefined();
      expect(file!.includes(Buffer.from("secret-exif"))).toBe(false);
    },
  );

  it("refuse les autres formats, même avec un faux type", async () => {
    const user = await createUser();
    expect(await saveProfilePhoto(user.id, await image("gif"))).toEqual({
      ok: false,
      error: "Format refusé : JPEG, PNG ou WebP.",
    });
    expect(await saveProfilePhoto(user.id, Buffer.from("pas une image"))).toEqual({
      ok: false,
      error: "Format refusé : JPEG, PNG ou WebP.",
    });
  });

  it("refuse plus de 5 Mo", async () => {
    const user = await createUser();
    expect(await saveProfilePhoto(user.id, new Uint8Array(MAX_PHOTO_BYTES + 1))).toEqual({
      ok: false,
      error: "Photo trop lourde : 5 Mo au plus.",
    });
  });

  it("nom aléatoire, et l'ancienne photo est supprimée", async () => {
    const user = await createUser();
    const first = await saveProfilePhoto(user.id, await image("png"));
    const second = await saveProfilePhoto(user.id, await image("jpeg"));
    if (!first.ok || !second.ok) throw new Error("upload");
    expect(first.image).not.toBe(second.image);
    const dir = join(process.env.UPLOADS_DIR!, "avatars");
    expect(existsSync(join(dir, first.image.replace("/avatars/", "")))).toBe(false);
    expect(existsSync(join(dir, second.image.replace("/avatars/", "")))).toBe(true);
    const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(row?.image).toBe(second.image);
  });

  it("ne sert que des noms de photo", async () => {
    expect(await readPhoto("../../etc/passwd")).toBeNull();
  });
});
