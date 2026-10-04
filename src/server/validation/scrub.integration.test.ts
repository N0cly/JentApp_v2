import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  accounts,
  pushSubscriptions,
  rateLimits,
  sessions,
  users,
  verifications,
} from "@/db/schema";
import { signIn, signUp } from "@/server/auth/accounts";
import {
  findBetDiscrepancies,
  findDiscrepancies,
  findShopDiscrepancies,
} from "@/server/ledger/check";
import { offerRound } from "@/server/leagues";
import { subscribe } from "@/server/push";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { keepEmails, NotValidationError, scrub } from "./scrub";

const VALIDATION = { APP_ENV: "validation" };
const me = { username: "Nocly", email: "nocly@exemple.fr", password: "motdepasse", terms: true };
const paco = { username: "Paco", email: "paco@exemple.fr", password: "motdepasse", terms: true };

async function userByName(name: string) {
  const [row] = await getDb().select().from(users).where(eq(users.name, name));
  return row!;
}

const login = (email: string, password: string) =>
  signIn({ email, password }, new Headers(), new Date());

async function seed() {
  await signUp(me, new Headers(), new Date());
  await signUp(paco, new Headers(), new Date());
  const ctx = await leagueWith(2);
  await offerRound(
    ctx.owner,
    ctx.league.id,
    { amount: 10, roundId: crypto.randomUUID() },
    new Date(),
  );
  const pacoRow = await userByName("Paco");
  await subscribe(pacoRow, {
    endpoint: "https://push.exemple.fr/sub/1",
    keys: { p256dh: "cle", auth: "auth" },
  });
  await getDb()
    .insert(rateLimits)
    .values({ key: "login:paco@exemple.fr", count: 1, resetAt: new Date(Date.now() + 60_000) });
  return ctx;
}

describe("nettoyage de la validation", () => {
  beforeEach(resetDb);

  it("refuse de tourner hors validation, sans rien toucher", async () => {
    await seed();
    const before = await getDb().select().from(users);
    for (const env of [{}, { APP_ENV: "production" }]) {
      await expect(scrub(getDb(), [me.email], env)).rejects.toBeInstanceOf(NotValidationError);
    }
    expect(await getDb().select().from(users)).toEqual(before);
    expect(await getDb().select().from(sessions)).not.toEqual([]);
  });

  it("garde intacts les comptes de VALIDATION_KEEP_EMAILS", async () => {
    await seed();
    const before = await userByName("Nocly");
    const report = await scrub(
      getDb(),
      keepEmails({ VALIDATION_KEEP_EMAILS: " NOCLY@exemple.fr, absent@exemple.fr" }),
      VALIDATION,
    );
    expect(report.kept).toEqual(["nocly@exemple.fr"]);
    expect(report.missing).toEqual(["absent@exemple.fr"]);
    expect(await userByName("Nocly")).toEqual(before);
    expect((await login(me.email, me.password)).ok).toBe(true);
  });

  it("les autres : plus d'email réel ni de mot de passe, plus de connexion ; pseudo gardé", async () => {
    const ctx = await seed();
    const report = await scrub(getDb(), [me.email], VALIDATION);
    expect(report.scrubbed).toBe(4);
    const others = (await getDb().select().from(users)).filter((u) => u.name !== "Nocly");
    expect(others.map((u) => u.name).sort()).toEqual(
      ["Paco", ctx.owner.name, ...ctx.players.map((p) => p.name)].sort(),
    );
    for (const u of others) expect(u.email).toMatch(/^joueur-\d+@validation\.invalid$/);
    const paco2 = await userByName("Paco");
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, paco2.id));
    expect(account!.password).toBeNull();
    expect((await login(paco.email, paco.password)).ok).toBe(false);
    expect((await login(paco2.email, paco.password)).ok).toBe(false);
  });

  it("plus aucune session, vérification, abonnement push ni compteur ; le journal reste juste", async () => {
    await seed();
    await getDb()
      .insert(verifications)
      .values({ identifier: "x", value: "y", expiresAt: new Date(Date.now() + 60_000) });
    await scrub(getDb(), [me.email], VALIDATION);
    expect(await getDb().select().from(sessions)).toEqual([]);
    expect(await getDb().select().from(verifications)).toEqual([]);
    expect(await getDb().select().from(pushSubscriptions)).toEqual([]);
    expect(await getDb().select().from(rateLimits)).toEqual([]);
    expect(await findDiscrepancies(getDb())).toEqual([]);
    expect(await findBetDiscrepancies(getDb())).toEqual([]);
    expect(await findShopDiscrepancies(getDb())).toEqual([]);
  });

  it("relancé sur une base déjà nettoyée : sans erreur", async () => {
    await seed();
    await scrub(getDb(), [me.email], VALIDATION);
    await expect(scrub(getDb(), [me.email], VALIDATION)).resolves.toMatchObject({ scrubbed: 4 });
  });

  it("sans compte gardé : tout le monde est nettoyé", async () => {
    await seed();
    expect(keepEmails({})).toEqual([]);
    expect((await scrub(getDb(), [], VALIDATION)).scrubbed).toBe(5);
  });
});
