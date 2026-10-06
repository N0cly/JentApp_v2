import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { notifications, users } from "@/db/schema";
import { startPush, subscribe, type PushMessage, type PushSender } from "@/server/push";
import {
  addSubscriber,
  removeSubscriber,
  stopListening,
  type Subscriber,
} from "@/server/realtime/hub";
import { NotValidationError } from "@/server/validation/scrub";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { previewRelease, previousVersion } from "./preview";
import { markReleaseSeen, pendingReleases } from "./seen";

const VALIDATION = { APP_ENV: "validation" };
const V2_1 = { version: "2.1.0", title: "Les stickers arrivent", push: "Ouvre le chat." };

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
function releasesDir(versions: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "jentapp-preview-"));
  dirs.push(dir);
  for (const v of versions) writeFileSync(join(dir, `${v}.md`), `title: Version ${v}\n\n- Un.\n`);
  return dir;
}

async function seenBy(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row!.lastSeenRelease;
}

const releaseRows = async () =>
  (await getDb().select().from(notifications)).filter((n) => n.type === "release");

/** Moi, le compte gardé, et un autre joueur ; tous deux à jour en 2.1.0. */
async function accounts() {
  const me = await createUser("Nocly");
  const other = await createUser("Paco");
  await getDb().update(users).set({ lastSeenRelease: "2.1.0" });
  return { me, other, keep: [me.email.toUpperCase()] };
}

beforeEach(resetDb);

describe("aperçu des nouveautés", () => {
  it("version précédente : celle qui précède parmi les notes, sinon 0.0.0", () => {
    expect(previousVersion("2.1.0", ["2.0.0", "2.1.0", "2.0.1", "2.2.0"])).toBe("2.0.1");
    expect(previousVersion("2.0.0", ["2.0.0", "2.1.0"])).toBe("0.0.0");
  });

  it("refus hors validation : rien n'est touché", async () => {
    const { me, keep } = await accounts();
    for (const env of [{}, { APP_ENV: "production" }]) {
      await expect(
        previewRelease(getDb(), V2_1, "2.0.0", keep, { push: true, env }),
      ).rejects.toThrow(NotValidationError);
    }
    expect(await seenBy(me.id)).toBe("2.1.0");
    expect(await releaseRows()).toEqual([]);
  });

  it("seuls les comptes gardés sont réarmés", async () => {
    const { me, other, keep } = await accounts();
    const report = await previewRelease(getDb(), V2_1, "2.0.0", keep, { env: VALIDATION });
    expect(report).toEqual({ accounts: 1, notifications: 0, pushSubscribers: 0 });
    expect(await seenBy(me.id)).toBe("2.0.0");
    expect(await seenBy(other.id)).toBe("2.1.0");
    expect(await releaseRows()).toEqual([]);
  });

  it("la feuille se rouvre autant de fois qu'on relance l'aperçu", async () => {
    const dir = releasesDir(["2.0.0", "2.1.0"]);
    const { me, keep } = await accounts();
    for (let i = 0; i < 2; i++) {
      await previewRelease(getDb(), V2_1, "2.0.0", keep, { env: VALIDATION });
      expect((await pendingReleases(me, "2.1.0", dir)).map((r) => r.version)).toEqual(["2.1.0"]);
      await markReleaseSeen(me, "2.1.0");
      expect(await pendingReleases(me, "2.1.0", dir)).toEqual([]);
    }
  });

  it("--push : une notification par compte gardé, recréée, aucune pour les autres", async () => {
    const { me, keep } = await accounts();
    const second = await createUser("Moi2");
    await subscribe(me, {
      endpoint: "https://push.exemple.fr/1",
      keys: { p256dh: "a", auth: "b" },
    });
    for (let i = 0; i < 2; i++) {
      const report = await previewRelease(getDb(), V2_1, "2.0.0", [...keep, second.email], {
        push: true,
        env: VALIDATION,
      });
      expect(report).toEqual({ accounts: 2, notifications: 2, pushSubscribers: 1 });
    }
    const rows = await releaseRows();
    expect(rows.map((r) => r.userId).sort()).toEqual([me.id, second.id].sort());
    for (const r of rows) {
      expect(r.payload).toEqual({ type: "release", ...V2_1 });
      expect(r.readAt).toBeNull();
    }
  });
});

describe("aperçu des nouveautés : push", () => {
  let stop: (() => void) | null = null;
  const open: Subscriber[] = [];
  afterEach(() => {
    stop?.();
    for (const s of open.splice(0)) removeSubscriber(s);
  });
  afterAll(stopListening);

  it("--push : le push part même si l'app du compte gardé est ouverte", async () => {
    const { me, other, keep } = await accounts();
    await subscribe(me, {
      endpoint: "https://push.exemple.fr/1",
      keys: { p256dh: "a", auth: "b" },
    });
    await subscribe(other, {
      endpoint: "https://push.exemple.fr/2",
      keys: { p256dh: "a", auth: "b" },
    });
    const stream: Subscriber = {
      userId: me.id,
      leagueId: "aucune",
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
    await previewRelease(getDb(), V2_1, "2.0.0", keep, { push: true, env: VALIDATION });
    const start = Date.now();
    while (sent.length === 0 && Date.now() - start < 2000)
      await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toEqual([
      {
        endpoint: "https://push.exemple.fr/1",
        message: { title: "JentApp", body: "Ouvre le chat.", url: "/nouveautes", tag: null },
      },
    ]);
  });
});
