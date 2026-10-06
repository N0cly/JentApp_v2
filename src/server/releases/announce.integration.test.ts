import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { appMeta, leagueMembers, notifications, users } from "@/db/schema";
import { startPush, subscribe, type PushMessage, type PushSender } from "@/server/push";
import {
  addSubscriber,
  removeSubscriber,
  stopListening,
  type Subscriber,
} from "@/server/realtime/hub";
import { notificationText } from "@/lib/notification-text";
import { listNotifications, markRead } from "@/server/notifications";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { announceRelease, RELEASE_LOCK, RELEASE_META_KEY } from "./announce";

const V2_1 = { version: "2.1.0", title: "Les stickers arrivent" };

async function noted() {
  const [row] = await getDb().select().from(appMeta).where(eq(appMeta.key, RELEASE_META_KEY));
  return row?.value ?? null;
}

async function note(version: string) {
  await getDb()
    .insert(appMeta)
    .values({ key: RELEASE_META_KEY, value: version })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: version } });
}

const releaseRows = async () =>
  (await getDb().select().from(notifications)).filter((n) => n.type === "release");

beforeEach(async () => {
  await resetDb();
  await getDb().delete(appMeta).where(eq(appMeta.key, RELEASE_META_KEY));
});

describe("annonce automatique d'une version", () => {
  it("premier démarrage, rien de noté : la version est notée, sans annonce", async () => {
    await leagueWith(1);
    expect(await announceRelease(V2_1)).toEqual({ kind: "initialized", version: "2.1.0" });
    expect(await noted()).toBe("2.1.0");
    expect(await releaseRows()).toEqual([]);
  });

  it("montée de version : une notification par compte non supprimé, quel que soit son niveau", async () => {
    const ctx = await leagueWith(2);
    const gone = await createUser();
    await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.id));
    await getDb().update(leagueMembers).set({ notifyLevel: "none" });
    await note("2.0.0");
    expect(await announceRelease(V2_1)).toEqual({
      kind: "announced",
      version: "2.1.0",
      accounts: 3,
    });
    const rows = await releaseRows();
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [ctx.owner.id, ...ctx.players.map((p) => p.id)].sort(),
    );
    for (const r of rows) {
      expect(r.leagueId).toBeNull();
      expect(r.payload).toEqual({ type: "release", ...V2_1 });
    }
    expect(await noted()).toBe("2.1.0");
  });

  it("push de la note : porté par la notification, qui l'affiche", async () => {
    const ctx = await leagueWith(1);
    await note("2.0.0");
    await announceRelease({ ...V2_1, push: "Les stickers sont là. Ouvre le chat." });
    const { items } = await listNotifications(ctx.players[0]!, 0, new Date());
    expect(items[0]!.payload).toEqual({
      type: "release",
      ...V2_1,
      push: "Les stickers sont là. Ouvre le chat.",
    });
    expect(notificationText(items[0]!.payload, new Date())).toBe(
      "Les stickers sont là. Ouvre le chat.",
    );
  });

  it("redémarrage sans changement de version, ou version plus ancienne : rien", async () => {
    await leagueWith(1);
    await note("2.0.0");
    await announceRelease(V2_1);
    expect(await announceRelease(V2_1)).toEqual({ kind: "unchanged", version: "2.1.0" });
    expect(await announceRelease({ version: "2.0.1", title: "Retour" })).toMatchObject({
      kind: "unchanged",
    });
    expect(await releaseRows()).toHaveLength(2);
  });

  it("deux démarrages simultanés : une seule annonce", async () => {
    await leagueWith(2);
    await note("2.0.0");
    const results = await Promise.all([announceRelease(V2_1), announceRelease(V2_1)]);
    expect(results.map((r) => r.kind).sort()).toEqual(["announced", "unchanged"]);
    expect(await releaseRows()).toHaveLength(3);
  });

  it("sous verrou : un démarrage attend celui qui annonce, puis ne fait rien", async () => {
    await leagueWith(1);
    await note("2.0.0");
    let pending: Promise<unknown> | null = null;
    let settled = false;
    await getDb().transaction(async (tx) => {
      // Un autre démarrage tient le verrou et annonce la même version.
      await tx.execute(sql`select pg_advisory_xact_lock(${RELEASE_LOCK})`);
      pending = announceRelease(V2_1).finally(() => (settled = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      await tx.execute(sql`update app_meta set value = '2.1.0' where key = ${RELEASE_META_KEY}`);
    });
    expect(await pending).toEqual({ kind: "unchanged", version: "2.1.0" });
    expect(await releaseRows()).toEqual([]);
  });

  it("dans le centre : sous le nom de l'app, ouvre les nouveautés", async () => {
    const ctx = await leagueWith(1);
    await note("2.0.0");
    await announceRelease(V2_1);
    const { items } = await listNotifications(ctx.players[0]!, 0, new Date());
    expect(items[0]).toMatchObject({ leagueId: null, leagueName: "JentApp" });
    expect(await markRead(ctx.players[0]!, items[0]!.id, new Date())).toMatchObject({
      leagueId: null,
    });
  });
});

describe("annonce automatique : push", () => {
  let stop: (() => void) | null = null;
  const open: Subscriber[] = [];
  afterEach(() => {
    stop?.();
    for (const s of open.splice(0)) removeSubscriber(s);
  });
  afterAll(stopListening);

  it("push à tous les abonnés, sauf à celui dont l'app est ouverte", async () => {
    const ctx = await leagueWith(2);
    const [watching, away] = [ctx.players[0]!, ctx.players[1]!];
    await subscribe(watching, {
      endpoint: "https://push.exemple.fr/1",
      keys: { p256dh: "a", auth: "b" },
    });
    await subscribe(away, {
      endpoint: "https://push.exemple.fr/2",
      keys: { p256dh: "a", auth: "b" },
    });
    await getDb().update(leagueMembers).set({ notifyLevel: "none" });
    const stream: Subscriber = {
      userId: watching.id,
      leagueId: ctx.league.id,
      openedAt: Date.now(),
      send: () => {},
      close: () => {},
    };
    addSubscriber(stream);
    open.push(stream);
    const sent: { endpoint: string; message: PushMessage }[] = [];
    const send: PushSender = async (subscription, message) => {
      sent.push({ endpoint: subscription.endpoint, message });
    };
    stop = await startPush(send);
    await note("2.0.0");
    await announceRelease(V2_1);
    const start = Date.now();
    while (sent.length === 0 && Date.now() - start < 2000)
      await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toEqual([
      {
        endpoint: "https://push.exemple.fr/2",
        message: {
          title: "JentApp",
          body: "JentApp 2.1.0 : Les stickers arrivent",
          url: "/nouveautes",
          tag: null,
        },
      },
    ]);
  });
});
