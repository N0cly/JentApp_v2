import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { leagueMembers, notifications, users } from "@/db/schema";
import { subscribe, startPush, type PushMessage, type PushSender } from "@/server/push";
import {
  addSubscriber,
  removeSubscriber,
  stopListening,
  type Subscriber,
} from "@/server/realtime/hub";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import {
  announcementReach,
  AnnouncementError,
  sendAnnouncement,
  writeAnnouncement,
} from "./announce";

const MESSAGE = "Maintenance ce soir à 23 h, coupure de 10 minutes.";

async function rows() {
  return getDb().select().from(notifications);
}

function fakeService() {
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const send: PushSender = async (subscription, message) => {
    sent.push({ endpoint: subscription.endpoint, message });
  };
  return { sent, send };
}

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

const sub = (n: number) => ({
  endpoint: `https://push.exemple.fr/sub/${n}`,
  keys: { p256dh: `cle-${n}`, auth: `auth-${n}` },
});

describe("annonce", () => {
  beforeEach(resetDb);

  it("aperçu : compte les destinataires, n'écrit rien", async () => {
    const ctx = await leagueWith(2);
    await subscribe(ctx.players[0]!, sub(1));
    expect(await announcementReach(getDb())).toEqual({ accounts: 3, pushSubscribers: 1 });
    expect(await rows()).toEqual([]);
  });

  it("une ligne par compte non supprimé, sans ligue ; un joueur au niveau « Rien » la reçoit", async () => {
    const ctx = await leagueWith(2);
    const loner = await createUser();
    const gone = await createUser();
    await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.id));
    await getDb()
      .update(leagueMembers)
      .set({ notifyLevel: "none" })
      .where(
        and(
          eq(leagueMembers.leagueId, ctx.league.id),
          eq(leagueMembers.userId, ctx.players[0]!.id),
        ),
      );

    expect(await sendAnnouncement(getDb(), `  ${MESSAGE} `)).toEqual({
      accounts: 4,
      pushSubscribers: 0,
    });
    const written = await rows();
    expect(written.map((r) => r.userId).sort()).toEqual(
      [ctx.owner.id, ...ctx.players.map((p) => p.id), loner.id].sort(),
    );
    for (const r of written) {
      expect(r.leagueId).toBeNull();
      expect(r.type).toBe("announcement");
      expect(r.payload).toEqual({ type: "announcement", message: MESSAGE });
    }
  });

  it("message vide ou de plus de 200 caractères : erreur, rien d'écrit", async () => {
    await leagueWith(1);
    for (const bad of ["", "   ", "x".repeat(201), undefined]) {
      await expect(sendAnnouncement(getDb(), bad)).rejects.toBeInstanceOf(AnnouncementError);
    }
    expect(await rows()).toEqual([]);
    await sendAnnouncement(getDb(), "é".repeat(200));
    expect(await rows()).toHaveLength(2);
  });

  it("une notification de pari exige toujours une ligue ; une annonce n'en a pas", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await expect(
      getDb()
        .insert(notifications)
        .values({ userId: p.id, type: "round", payload: { type: "round", amount: 1 } }),
    ).rejects.toThrow();
    await expect(
      getDb()
        .insert(notifications)
        .values({
          userId: p.id,
          leagueId: ctx.league.id,
          type: "announcement",
          payload: { type: "announcement", message: MESSAGE },
        }),
    ).rejects.toThrow();
  });
});

describe("annonce : push", () => {
  let stop: (() => void) | null = null;
  const open: Subscriber[] = [];
  beforeEach(resetDb);
  afterEach(() => {
    stop?.();
    for (const s of open.splice(0)) removeSubscriber(s);
  });
  afterAll(stopListening);

  it("signal émis après validation ; titre JentApp, le message, lien vers le centre", async () => {
    const ctx = await leagueWith(1);
    await subscribe(ctx.players[0]!, sub(1));
    const service = fakeService();
    stop = await startPush(service.send);

    await expect(
      getDb().transaction(async (tx) => {
        await writeAnnouncement(tx, "Annulée");
        throw new Error("annulée");
      }),
    ).rejects.toThrow();
    await sendAnnouncement(getDb(), MESSAGE);

    expect(await waitFor(() => service.sent.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(service.sent).toEqual([
      {
        endpoint: sub(1).endpoint,
        message: { title: "JentApp", body: MESSAGE, url: "/notifications", tag: null },
      },
    ]);
  });

  it("un joueur avec un flux ouvert ne reçoit pas de push", async () => {
    const ctx = await leagueWith(2);
    const watching = ctx.players[0]!;
    const away = ctx.players[1]!;
    await subscribe(watching, sub(1));
    await subscribe(away, sub(2));
    const stream: Subscriber = {
      userId: watching.id,
      leagueId: ctx.league.id,
      openedAt: Date.now(),
      send: () => {},
      close: () => {},
    };
    addSubscriber(stream);
    open.push(stream);
    const service = fakeService();
    stop = await startPush(service.send);

    expect(await sendAnnouncement(getDb(), MESSAGE)).toEqual({ accounts: 3, pushSubscribers: 2 });
    expect(await waitFor(() => service.sent.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(service.sent.map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });
});
