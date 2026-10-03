import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { notifications, pushSubscriptions } from "@/db/schema";
import { createBet, placeWager, resolveBet, settleDue } from "@/server/bets";
import { offerRound } from "@/server/leagues";
import { notify } from "@/server/notifications/create";
import {
  addSubscriber,
  removeSubscriber,
  stopListening,
  type Subscriber,
} from "@/server/realtime/hub";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { pushNotification, startPush, subscribe, type PushMessage, type PushSender } from "./push";

const sub = (n: number) => ({
  endpoint: `https://push.exemple.fr/sub/${n}`,
  keys: { p256dh: `cle-${n}`, auth: `auth-${n}` },
});

/** Service de push simulé : garde ce qui part, répond ce qu'on lui dit. */
function fakeService(status: (endpoint: string) => number = () => 201) {
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const send: PushSender = async (subscription, message) => {
    const code = status(subscription.endpoint);
    if (code >= 400) throw Object.assign(new Error("refusé"), { statusCode: code });
    sent.push({ endpoint: subscription.endpoint, message });
  };
  return { sent, send };
}

async function lastNotification(userId: string) {
  const [row] = await getDb().select().from(notifications).where(eq(notifications.userId, userId));
  return row!;
}

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

describe("abonnements", () => {
  beforeEach(resetDb);

  it("un seul abonnement par endpoint, rattaché au dernier joueur qui s'abonne", async () => {
    const ctx = await leagueWith(1);
    await subscribe(ctx.owner, sub(1));
    await subscribe(ctx.owner, sub(1));
    await subscribe(ctx.players[0]!, sub(1));
    const rows = await getDb().select().from(pushSubscriptions);
    expect(rows.map((r) => r.userId)).toEqual([ctx.players[0]!.id]);
  });

  it("refuse un endpoint qui n'est pas en https", async () => {
    const ctx = await leagueWith(0);
    await expect(
      subscribe(ctx.owner, { endpoint: "http://exemple.fr/x", keys: { p256dh: "a", auth: "b" } }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("envoi", () => {
  beforeEach(resetDb);

  it("titre, phrase et URL de la bonne ligue", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await subscribe(p, sub(1));
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    const service = fakeService();
    expect(await pushNotification((await lastNotification(p.id)).id, service.send, T0)).toBe(1);
    expect(service.sent[0]!.message).toEqual({
      title: "Bande",
      body: "Tournée générale : +10 clopes pour tout le monde",
      url: `/l/${ctx.league.id}/paris`,
      tag: null,
    });
  });

  it("un pari : son URL et une étiquette par pari", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await subscribe(p, sub(1));
    const created = await createBet(
      ctx.owner,
      ctx.league.id,
      { question: "Qui ?", options: ["A", "B"], moment: "NIGHT", closesAt: CLOSE.toISOString() },
      T0,
    );
    if (!created.ok) throw new Error("pari");
    const service = fakeService();
    await pushNotification((await lastNotification(p.id)).id, service.send, T0);
    expect(service.sent[0]!.message).toMatchObject({
      url: `/l/${ctx.league.id}/paris/${created.betId}`,
      tag: `bet:${created.betId}`,
    });
  });

  it("410 ou 404 : abonnement supprimé ; autre échec : gardé et journalisé", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    for (const n of [1, 2, 3]) await subscribe(p, sub(n));
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = fakeService((e) => (e.endsWith("/1") ? 410 : e.endsWith("/2") ? 404 : 500));
    expect(await pushNotification((await lastNotification(p.id)).id, service.send, T0)).toBe(0);
    const left = await getDb().select().from(pushSubscriptions);
    expect(left.map((r) => r.endpoint)).toEqual([sub(3).endpoint]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("aucun push à un joueur qui a un flux ouvert", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await subscribe(p, sub(1));
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    const stream: Subscriber = {
      userId: p.id,
      leagueId: randomUUID(),
      openedAt: Date.now(),
      send: () => {},
      close: () => {},
    };
    addSubscriber(stream);
    const service = fakeService();
    expect(await pushNotification((await lastNotification(p.id)).id, service.send, T0)).toBe(0);
    removeSubscriber(stream);
    expect(await pushNotification((await lastNotification(p.id)).id, service.send, T0)).toBe(1);
  });

  it("aucun push pour « Pari réglé »", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const created = await createBet(
      ctx.owner,
      ctx.league.id,
      { question: "Qui ?", options: ["A", "B"], moment: "NIGHT", closesAt: CLOSE.toISOString() },
      T0,
    );
    if (!created.ok) throw new Error("pari");
    const [a] = await optionIds(created.betId);
    await placeWager(
      p,
      ctx.league.id,
      created.betId,
      { optionId: a!, amount: 2, ticketId: randomUUID() },
      at(1),
    );
    await resolveBet(
      ctx.owner,
      ctx.league.id,
      created.betId,
      { optionId: a! },
      new Date(CLOSE.getTime() + 60_000),
    );
    await settleDue(ctx.league.id, new Date(CLOSE.getTime() + 20 * 60_000));
    await subscribe(p, sub(1));
    const settled = (
      await getDb().select().from(notifications).where(eq(notifications.userId, p.id))
    ).find((n) => n.type === "bet_settled");
    const service = fakeService();
    expect(await pushNotification(settled!.id, service.send, T0)).toBe(0);
    expect(service.sent).toEqual([]);
  });
});

describe("après validation seulement", () => {
  let stop: (() => void) | null = null;
  beforeEach(resetDb);
  afterEach(() => stop?.());
  afterAll(stopListening);

  it("un événement annulé ne part pas ; un événement validé part", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await subscribe(p, sub(1));
    const service = fakeService();
    stop = await startPush(service.send);
    await expect(
      getDb().transaction(async (tx) => {
        await notify(tx, {
          kind: "round",
          leagueId: ctx.league.id,
          actorId: ctx.owner.id,
          amount: 7,
        });
        throw new Error("annulée");
      }),
    ).rejects.toThrow();
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    expect(await waitFor(() => service.sent.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(service.sent.map((s) => s.message.body)).toEqual([
      "Tournée générale : +10 clopes pour tout le monde",
    ]);
  });
});
