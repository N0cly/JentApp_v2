import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { signIn, signUp } from "@/server/auth/accounts";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { impersonate, LoginError } from "./login";
import { NotValidationError, scrub } from "./scrub";

const VALIDATION = { APP_ENV: "validation" };
const me = { username: "Nocly", email: "nocly@exemple.fr", password: "motdepasse", terms: true };
const paco = { username: "Paco", email: "paco@exemple.fr", password: "motdepasse", terms: true };

const login = (email: string, password: string) =>
  signIn({ email, password }, new Headers(), new Date());

describe("incarner un joueur", () => {
  beforeEach(async () => {
    await resetDb();
    await signUp(me, new Headers(), new Date());
    await signUp(paco, new Headers(), new Date());
    await scrub(getDb(), [me.email], VALIDATION);
  });

  it("donne un mot de passe à un compte nettoyé, qui peut alors se connecter", async () => {
    const who = await impersonate(getDb(), "paco", "essai-validation", VALIDATION);
    expect(who.username).toBe("Paco");
    expect(who.email).toMatch(/@validation\.invalid$/);
    expect((await login(who.email, "essai-validation")).ok).toBe(true);
    expect((await login(paco.email, paco.password)).ok).toBe(false);
  });

  it("un compte sans mot de passe enregistré peut aussi être incarné", async () => {
    const ctx = await leagueWith(1);
    await scrub(getDb(), [me.email], VALIDATION);
    const who = await impersonate(getDb(), ctx.players[0]!.name!, "essai-validation", VALIDATION);
    expect((await login(who.email, "essai-validation")).ok).toBe(true);
  });

  it("refuse hors validation", async () => {
    for (const env of [{}, { APP_ENV: "production" }]) {
      await expect(impersonate(getDb(), "Paco", "essai-validation", env)).rejects.toBeInstanceOf(
        NotValidationError,
      );
    }
  });

  it("refuse un compte gardé, un pseudo inconnu, un mot de passe trop court", async () => {
    await expect(
      impersonate(getDb(), "Nocly", "essai-validation", VALIDATION),
    ).rejects.toBeInstanceOf(LoginError);
    await expect(
      impersonate(getDb(), "Personne", "essai-validation", VALIDATION),
    ).rejects.toBeInstanceOf(LoginError);
    await expect(impersonate(getDb(), "Paco", "court", VALIDATION)).rejects.toBeInstanceOf(
      LoginError,
    );
    expect((await login(me.email, me.password)).ok).toBe(true);
  });
});
