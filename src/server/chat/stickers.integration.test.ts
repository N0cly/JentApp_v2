import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { messages } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { stickerMessages, stickersRoot } from "@/server/stickers";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { readMessage, readMessages, sendMessage, sendSticker } from "./messages";

// docs/STICKERS.md, § Message et § Tests (Message, Déduplication).
const now = new Date("2026-10-07T18:00:00Z");

const png = (color = "#f2b632", size = 480) =>
  sharp({ create: { width: size, height: size, channels: 4, background: color } })
    .png()
    .toBuffer();

async function stickerOf(user: { id: string }, leagueId: string, body?: string) {
  const result = await sendSticker(user, leagueId, await png(), body, now);
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-chat-stickers-"));
});

describe("message sticker", () => {
  beforeEach(resetDb);

  it("texte facultatif ; l'adresse et les dimensions sont renvoyées, jamais le chemin", async () => {
    const { league, owner } = await leagueWith(0);
    const alone = await stickerOf(owner, league.id);
    const withText = await stickerOf(owner, league.id, "  regarde   ça ");
    const [a, b] = await Promise.all([
      readMessage(owner, league.id, alone, now),
      readMessage(owner, league.id, withText, now),
    ]);
    expect(a).toMatchObject({ kind: "sticker", body: null });
    expect(b).toMatchObject({ kind: "sticker", body: "regarde ça" });
    const [row] = await getDb().select().from(messages).where(eq(messages.id, alone));
    const hash = (row!.data as { hash: string }).hash;
    expect(row!.data).toMatchObject({ hash, width: 480, height: 480 });
    expect((row!.data as { bytes: number }).bytes).toBeGreaterThan(0);
    expect(a!.sticker).toEqual({
      url: `/api/l/${league.id}/stickers/${hash}`,
      width: 480,
      height: 480,
    });
    const json = JSON.stringify(await readMessages(owner, league.id, now));
    expect(json).not.toContain(process.env.UPLOADS_DIR!);
    expect(json).not.toContain("uploads");
    expect(json).not.toContain(".webp");
  });

  it("le même sticker envoyé deux fois : un seul fichier, deux messages", async () => {
    const { league, owner, players } = await leagueWith(1);
    await stickerOf(owner, league.id);
    await stickerOf(players[0]!, league.id);
    expect(await readdir(join(stickersRoot(), league.id))).toHaveLength(1);
    const rows = await getDb().select().from(messages).where(eq(messages.kind, "sticker"));
    expect(rows).toHaveLength(2);
  });

  it("limite de 30 par minute partagée avec les messages texte", async () => {
    const { league, owner } = await leagueWith(0);
    for (let i = 0; i < 29; i++) {
      const sent = await sendMessage(owner, league.id, { kind: "text", body: `m${i}` }, now);
      expect(sent.ok).toBe(true);
    }
    await stickerOf(owner, league.id);
    expect(await sendSticker(owner, league.id, await png(), "", now)).toEqual({
      ok: false,
      error: "Doucement. Réessaie dans un instant.",
    });
    expect(await sendMessage(owner, league.id, { kind: "text", body: "encore" }, now)).toEqual({
      ok: false,
      error: "Doucement. Réessaie dans un instant.",
    });
  });

  it("texte trop long, image refusée : pas de message", async () => {
    const { league, owner } = await leagueWith(0);
    expect(await sendSticker(owner, league.id, await png(), "x".repeat(502), now)).toEqual({
      ok: false,
      error: "500 caractères au plus. Il y en a 2 de trop.",
    });
    expect(await sendSticker(owner, league.id, Buffer.from("pas une image"), "", now)).toEqual({
      ok: false,
      error: stickerMessages.unreadable,
    });
    expect(await sendSticker(owner, league.id, Buffer.alloc(6 * 1024 * 1024, 1), "", now)).toEqual({
      ok: false,
      error: stickerMessages.tooLarge,
    });
    expect(await getDb().select().from(messages).where(eq(messages.kind, "sticker"))).toHaveLength(
      0,
    );
  });

  it("un non-membre reçoit une 404", async () => {
    const { league } = await leagueWith(0);
    const other = await leagueWith(0);
    await expect(sendSticker(other.owner, league.id, await png(), "", now)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("le texte d'un sticker mentionne comme un message", async () => {
    const { league, owner, players } = await leagueWith(1);
    const id = await stickerOf(owner, league.id, `@${players[0]!.name} regarde`);
    const view = await readMessage(owner, league.id, id, now);
    expect(view?.mentions).toEqual([players[0]!.name]);
  });
});
