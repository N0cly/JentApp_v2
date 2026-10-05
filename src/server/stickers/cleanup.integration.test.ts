import { existsSync } from "node:fs";
import { mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/server/account/delete";
import { deleteMessage, readMessage, sendSticker } from "@/server/chat";
import { deleteLeague } from "@/server/leagues";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { stickersRoot } from "./files";
import { findOrphanStickers, GC_GRACE_MS, removeOrphanStickers } from "./gc";

// docs/STICKERS.md, § Nettoyage et § Tests (Nettoyage).
const now = new Date("2026-10-07T18:00:00Z");
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
afterAll(() => client.end());

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-cleanup-stickers-"));
});

const image = (color: string) =>
  sharp({ create: { width: 64, height: 64, channels: 4, background: color } })
    .png()
    .toBuffer();

async function sticker(user: { id: string }, leagueId: string, color = "#f2b632") {
  const sent = await sendSticker(user, leagueId, await image(color), "", now);
  if (!sent.ok) throw new Error(sent.error);
  const view = await readMessage(user, leagueId, sent.id, now);
  const hash = view!.sticker!.url.split("/").at(-1)!;
  return { id: sent.id, hash, path: join(stickersRoot(), leagueId, `${hash}.webp`) };
}

describe("nettoyage des stickers", () => {
  beforeEach(resetDb);

  it("suppression du seul message qui cite le fichier : fichier supprimé", async () => {
    const { league, owner } = await leagueWith(0);
    const sent = await sticker(owner, league.id);
    expect(existsSync(sent.path)).toBe(true);
    await deleteMessage(owner, league.id, sent.id, now);
    expect(existsSync(sent.path)).toBe(false);
  });

  it("suppression d'un message sur deux : fichier gardé", async () => {
    const { league, owner, players } = await leagueWith(1);
    const first = await sticker(owner, league.id);
    const second = await sticker(players[0]!, league.id);
    expect(second.path).toBe(first.path);
    await deleteMessage(owner, league.id, first.id, now);
    expect(existsSync(first.path)).toBe(true);
    await deleteMessage(players[0]!, league.id, second.id, now);
    expect(existsSync(first.path)).toBe(false);
  });

  it("le même sticker dans une autre ligue n'est pas touché", async () => {
    const one = await leagueWith(0);
    const two = await leagueWith(0);
    const a = await sticker(one.owner, one.league.id);
    const b = await sticker(two.owner, two.league.id);
    await deleteMessage(one.owner, one.league.id, a.id, now);
    expect(existsSync(b.path)).toBe(true);
  });

  it("suppression du compte : ses stickers que personne d'autre ne cite sont supprimés", async () => {
    const { league, owner, players } = await leagueWith(1);
    const player = players[0]!;
    const alone = await sticker(player, league.id, "#ff0000");
    const shared = await sticker(player, league.id, "#00ff00");
    await sticker(owner, league.id, "#00ff00");
    const result = await deleteAccount(
      { id: player.id, username: player.name!, email: player.email },
      player.name,
      now,
    );
    expect(result).toEqual({ ok: true });
    expect(existsSync(alone.path)).toBe(false);
    expect(existsSync(shared.path)).toBe(true);
  });

  it("suppression du compte : le dossier de sa ligue solitaire disparaît", async () => {
    const { league, owner } = await leagueWith(0);
    const sent = await sticker(owner, league.id);
    await deleteAccount(
      { id: owner.id, username: owner.name!, email: owner.email },
      owner.name,
      now,
    );
    expect(existsSync(sent.path)).toBe(false);
    expect(existsSync(join(stickersRoot(), league.id))).toBe(false);
  });

  it("suppression de la ligue : son dossier disparaît", async () => {
    const { league, owner } = await leagueWith(1);
    await sticker(owner, league.id);
    expect(await deleteLeague({ id: owner.id }, league.id, league.name)).toEqual({ ok: true });
    expect(existsSync(join(stickersRoot(), league.id))).toBe(false);
  });

  it("stickers-gc trouve un fichier orphelin, laisse les cités et les récents", async () => {
    const { league, owner } = await leagueWith(0);
    const cited = await sticker(owner, league.id);
    const dir = join(stickersRoot(), league.id);
    const orphan = join(dir, `${"b".repeat(64)}.webp`);
    const fresh = join(dir, `${"c".repeat(64)}.webp`);
    const interrupted = join(dir, `${"d".repeat(64)}.webp.123.456.tmp`);
    for (const path of [orphan, fresh, interrupted]) await writeFile(path, "x");
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await utimes(orphan, old, old);
    await utimes(interrupted, old, old);
    await utimes(cited.path, old, old);

    const db = drizzle(client);
    const found = await findOrphanStickers(db, stickersRoot());
    expect(found.sort()).toEqual([orphan, interrupted].sort());

    await removeOrphanStickers(stickersRoot(), found);
    expect((await readdir(dir)).sort()).toEqual(
      [`${cited.hash}.webp`, `${"c".repeat(64)}.webp`].sort(),
    );
  });

  it("stickers-gc : un dossier de ligue vidé est retiré", async () => {
    const { league, owner } = await leagueWith(0);
    const sent = await sticker(owner, league.id);
    await deleteMessage(owner, league.id, sent.id, now);
    const dir = join(stickersRoot(), league.id);
    await removeOrphanStickers(stickersRoot(), []);
    expect(existsSync(dir)).toBe(false);
  });
});
