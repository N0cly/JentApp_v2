import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sendSticker } from "@/server/chat";
import { leaveLeague } from "@/server/leagues";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { stickerResponse } from "./serve";
import { readMessage } from "@/server/chat";

// docs/STICKERS.md, § Accès et § Tests (Accès).
const now = new Date("2026-10-07T18:00:00Z");

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-serve-stickers-"));
});

async function withSticker() {
  const setup = await leagueWith(1);
  const image = await sharp({
    create: { width: 120, height: 80, channels: 4, background: "#f2b632" },
  })
    .png()
    .toBuffer();
  const sent = await sendSticker(setup.owner, setup.league.id, image, "", now);
  if (!sent.ok) throw new Error(sent.error);
  const view = await readMessage(setup.owner, setup.league.id, sent.id, now);
  const hash = view!.sticker!.url.split("/").at(-1)!;
  return { ...setup, hash };
}

describe("GET /api/l/{ligue}/stickers/{nom}", () => {
  beforeEach(resetDb);

  it("un membre lit le WebP, avec les en-têtes de cache privés", async () => {
    const { league, players, hash } = await withSticker();
    const response = await stickerResponse(players[0]!, league.id, hash);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 120, height: 80 });
  });

  it("non-membre, membre d'une autre ligue, membre parti, sans session : 404", async () => {
    const { league, players, hash } = await withSticker();
    const stranger = await createUser();
    const other = await leagueWith(0);
    await leaveLeague({ id: players[0]!.id }, league.id, now);
    for (const user of [stranger, other.owner, players[0]!, null]) {
      expect((await stickerResponse(user, league.id, hash)).status).toBe(404);
    }
  });

  it("un sticker d'une autre ligue ne se lit pas par la sienne : 404", async () => {
    const { hash } = await withSticker();
    const other = await leagueWith(0);
    expect((await stickerResponse(other.owner, other.league.id, hash)).status).toBe(404);
  });

  it.each([
    ["pas une empreinte", "chat"],
    ["avec ..", `..%2F${"a".repeat(61)}`],
    ["chemin", "../../avatars/x"],
    ["63 caractères", "a".repeat(63)],
    ["majuscules", "A".repeat(64)],
    ["extension", `${"a".repeat(64)}.webp`],
  ])("nom invalide (%s) : 404", async (_, name) => {
    const { league, owner } = await withSticker();
    expect((await stickerResponse(owner, league.id, name)).status).toBe(404);
  });

  it("empreinte valide mais absente : 404", async () => {
    const { league, owner } = await withSticker();
    expect((await stickerResponse(owner, league.id, "0".repeat(64))).status).toBe(404);
  });
});
