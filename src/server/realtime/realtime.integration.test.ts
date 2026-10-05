import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { sendMessage, sendSticker } from "@/server/chat";
import { offerRound } from "@/server/leagues";
import { post } from "@/server/ledger";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import {
  addSubscriber,
  ensureListening,
  removeSubscriber,
  stopListening,
  type ServerEvent,
  type Subscriber,
} from "./hub";
import { notify } from "./notify";

function subscriber(leagueId: string, userId: string) {
  const events: ServerEvent[] = [];
  const sub: Subscriber = {
    leagueId,
    userId,
    openedAt: Date.now(),
    send: (e) => events.push(e),
    close: () => {},
  };
  addSubscriber(sub);
  return { sub, events };
}

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("diffusion", () => {
  beforeAll(async () => {
    await ensureListening();
  });
  afterAll(async () => {
    await stopListening();
  });
  beforeEach(resetDb);

  it("NOTIFY reçu après validation, jamais après annulation", async () => {
    const { league, owner } = await leagueWith(0);
    const { sub, events } = subscriber(league.id, owner.id);
    await expect(
      getDb().transaction(async (tx) => {
        await notify(tx, { league: league.id, type: "bet.changed", id: "annule" });
        throw new Error("annulée");
      }),
    ).rejects.toThrow();
    await getDb().transaction((tx) =>
      notify(tx, { league: league.id, type: "bet.changed", id: "valide" }),
    );
    expect(await waitFor(() => events.some((e) => "id" in e && e.id === "valide"))).toBe(true);
    await pause(200);
    expect(events.some((e) => "id" in e && e.id === "annule")).toBe(false);
    removeSubscriber(sub);
  });

  it("une tournée générale émet member.changed", async () => {
    const { league, owner, players } = await leagueWith(1);
    const { sub, events } = subscriber(league.id, players[0]!.id);
    const result = await offerRound(
      owner,
      league.id,
      { amount: 10, roundId: randomUUID() },
      new Date(),
    );
    expect(result.ok).toBe(true);
    expect(await waitFor(() => events.some((e) => e.type === "member.changed"))).toBe(true);
    removeSubscriber(sub);
  });

  it("un événement n'atteint que les flux de sa ligue", async () => {
    const one = await leagueWith(0);
    const two = await leagueWith(0);
    const a = subscriber(one.league.id, one.owner.id);
    const b = subscriber(two.league.id, two.owner.id);
    const sent = await sendMessage(
      one.owner,
      one.league.id,
      { kind: "text", body: "coucou" },
      new Date(),
    );
    if (!sent.ok) throw new Error();
    expect(await waitFor(() => a.events.some((e) => e.type === "message.new"))).toBe(true);
    await pause(200);
    expect(b.events.filter((e) => e.type === "message.new")).toHaveLength(0);
    removeSubscriber(a.sub);
    removeSubscriber(b.sub);
  });

  it("un sticker arrive en direct chez un autre membre", async () => {
    process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-realtime-stickers-"));
    const { league, owner, players } = await leagueWith(1);
    const other = subscriber(league.id, players[0]!.id);
    const image = await sharp({
      create: { width: 64, height: 64, channels: 4, background: "#f2b632" },
    })
      .png()
      .toBuffer();
    const sent = await sendSticker(owner, league.id, image, "", new Date());
    if (!sent.ok) throw new Error(sent.error);
    expect(
      await waitFor(() =>
        other.events.some((e) => e.type === "message.new" && String(e.id) === String(sent.id)),
      ),
    ).toBe(true);
    removeSubscriber(other.sub);
  });

  it("balance.changed n'atteint que le joueur concerné", async () => {
    const { league, owner, players } = await leagueWith(1);
    const mine = subscriber(league.id, players[0]!.id);
    const other = subscriber(league.id, owner.id);
    await getDb().transaction((tx) =>
      post(tx, { leagueId: league.id, userId: players[0]!.id, delta: 5, reason: "round" }),
    );
    expect(await waitFor(() => mine.events.some((e) => e.type === "balance.changed"))).toBe(true);
    await pause(200);
    expect(other.events.filter((e) => e.type === "balance.changed")).toHaveLength(0);
    removeSubscriber(mine.sub);
    removeSubscriber(other.sub);
  });
});
