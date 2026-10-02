import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { resetDb } from "@/test/db";
import { requestPasswordReset, resendVerification, signIn, signUp } from "./accounts";

const limited = {
  ok: false,
  formError: "Trop d'essais. Réessaie dans 15 minutes.",
  status: 429,
};

function fromIp(ip: string) {
  return new Headers({ "x-forwarded-for": `198.51.100.1, ${ip}` });
}

function account(n: number) {
  return { username: `Joueur${n}`, email: `j${n}@exemple.fr`, password: "motdepasse", terms: true };
}

describe("limites de tentatives", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("TRUST_PROXY", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("connexion : 5 échecs par quart d'heure et par email", async () => {
    await signUp(account(1), fromIp("10.0.0.1"));
    for (let i = 0; i < 5; i++) {
      // Une adresse différente à chaque fois : seul le compteur par email joue.
      const result = await signIn(
        { email: "j1@exemple.fr", password: "mauvais!!" },
        fromIp(`10.1.0.${i}`),
      );
      expect(result).toMatchObject({ ok: false, formError: "Email ou mot de passe incorrect." });
    }
    const blocked = await signIn(
      { email: "J1@exemple.fr", password: "motdepasse" },
      fromIp("10.2.0.1"),
    );
    expect(blocked).toEqual(limited);
  });

  it("connexion : 5 échecs par quart d'heure et par adresse IP", async () => {
    await signUp(account(1), fromIp("10.0.0.1"));
    for (let i = 0; i < 5; i++) {
      await signIn({ email: `inconnu${i}@exemple.fr`, password: "mauvais!!" }, fromIp("10.9.9.9"));
    }
    expect(
      await signIn({ email: "j1@exemple.fr", password: "motdepasse" }, fromIp("10.9.9.9")),
    ).toEqual(limited);
    expect(
      (await signIn({ email: "j1@exemple.fr", password: "motdepasse" }, fromIp("10.9.9.8"))).ok,
    ).toBe(true);
  });

  it("connexion : les réussites ne comptent pas", async () => {
    await signUp(account(1), fromIp("10.0.0.1"));
    for (let i = 0; i < 7; i++) {
      expect(
        (await signIn({ email: "j1@exemple.fr", password: "motdepasse" }, fromIp("10.0.0.1"))).ok,
      ).toBe(true);
    }
  });

  it("inscription : 5 comptes par heure et par adresse IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await signUp(account(i), fromIp("10.3.3.3"))).ok).toBe(true);
    }
    expect(await signUp(account(9), fromIp("10.3.3.3"))).toEqual({
      ...limited,
      formError: "Trop d'essais. Réessaie dans 60 minutes.",
    });
    expect((await signUp(account(9), fromIp("10.3.3.4"))).ok).toBe(true);
  });

  it("réinitialisation : 3 demandes par heure et par email", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await requestPasswordReset({ email: "x@exemple.fr" }, new Headers())).toEqual({
        ok: true,
      });
    }
    expect(await requestPasswordReset({ email: "X@exemple.fr" }, new Headers())).toMatchObject({
      ok: false,
      status: 429,
    });
    expect(await requestPasswordReset({ email: "y@exemple.fr" }, new Headers())).toEqual({
      ok: true,
    });
  });

  it("renvoi de la confirmation : 3 par heure et par compte", async () => {
    await signUp(account(1), fromIp("10.0.0.1"));
    const [user] = await getDb().select().from(users);
    const me = { id: user!.id, email: user!.email };
    for (let i = 0; i < 3; i++) expect(await resendVerification(me)).toEqual({ ok: true });
    expect(await resendVerification(me)).toMatchObject({ ok: false, status: 429 });
  });
});
