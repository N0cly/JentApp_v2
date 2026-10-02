import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { outbox } from "@/server/email";
import { resetDb } from "@/test/db";
import { linkIn, requestHeaders } from "@/test/http";
import { getAuth } from "./auth";
import {
  getSessionUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signIn,
  signUp,
} from "./accounts";

const valid = { username: "Nocly", email: "nocly@exemple.fr", password: "motdepasse", terms: true };

async function flush() {
  // Les emails partent sans attente : laisser la file se vider.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function follow(link: string) {
  return getAuth().handler(new Request(link));
}

describe("inscription", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
  });

  it("crée le compte, ouvre une session et envoie la confirmation", async () => {
    const result = await signUp(valid, new Headers());
    expect(result.ok).toBe(true);

    const [user] = await getDb().select().from(users).where(eq(users.email, valid.email));
    expect(user?.name).toBe("Nocly");
    expect(user?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(user?.emailVerified).toBe(false);

    const me = await getSessionUser(requestHeaders(result.ok ? result.headers : undefined));
    expect(me?.username).toBe("Nocly");

    await flush();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.subject).toBe("Confirme ton email JentApp");
    expect(outbox[0]?.text).toContain("Salut Nocly,");
  });

  it("donne toutes les erreurs ensemble, avec les messages de M1", async () => {
    const result = await signUp(
      { username: "a b", email: "pas-un-email", password: "motde", terms: false },
      new Headers(),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        username: "3 à 20 caractères : lettres, chiffres, _ et -.",
        email: "Cet email n'a pas l'air valide.",
        password: "8 caractères minimum. Il en manque 3.",
        terms: "Coche la case pour continuer.",
      },
    });
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it("accepte les accents, refuse un pseudo pris sans tenir compte de la casse", async () => {
    expect((await signUp({ ...valid, username: "Léa_Dèche-2" }, new Headers())).ok).toBe(true);
    const taken = await signUp(
      { ...valid, username: "léa_dèche-2", email: "autre@exemple.fr" },
      new Headers(),
    );
    expect(taken).toEqual({ ok: false, fieldErrors: { username: "Ce pseudo est déjà pris." } });
  });

  it("dit qu'un email est déjà utilisé", async () => {
    await signUp(valid, new Headers());
    const again = await signUp(
      { ...valid, username: "Autre", email: "NOCLY@exemple.fr" },
      new Headers(),
    );
    expect(again).toEqual({
      ok: false,
      fieldErrors: { email: "Un compte existe déjà avec cet email." },
    });
  });
});

describe("confirmation de l'email", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("le lien confirme l'email", async () => {
    await signUp(valid, new Headers());
    await flush();
    const response = await follow(linkIn(outbox[0]!.text));
    expect(response.status).toBe(302);
    const [user] = await getDb().select().from(users);
    expect(user?.emailVerified).toBe(true);
  });

  it("le lien expire après 24 heures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signUp(valid, new Headers());
    await flush();
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1000);
    const response = await follow(linkIn(outbox[0]!.text));
    expect(response.headers.get("location")).toContain("error=");
    const [user] = await getDb().select().from(users);
    expect(user?.emailVerified).toBe(false);
  });

  it("on peut renvoyer l'email", async () => {
    await signUp(valid, new Headers());
    await resendVerification(valid.email);
    await flush();
    expect(outbox).toHaveLength(2);
  });
});

describe("connexion", () => {
  beforeEach(async () => {
    await resetDb();
    await signUp(valid, new Headers());
  });

  it("ouvre une session avec le bon mot de passe", async () => {
    const result = await signIn(
      { email: "Nocly@Exemple.fr", password: valid.password },
      new Headers(),
    );
    expect(result.ok).toBe(true);
  });

  it("ne dit jamais lequel de l'email ou du mot de passe est faux", async () => {
    const wrongPassword = await signIn(
      { email: valid.email, password: "mauvais!!" },
      new Headers(),
    );
    const unknownEmail = await signIn(
      { email: "x@exemple.fr", password: valid.password },
      new Headers(),
    );
    expect(wrongPassword).toEqual({ ok: false, formError: "Email ou mot de passe incorrect." });
    expect(unknownEmail).toEqual(wrongPassword);
  });
});

describe("mot de passe oublié", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
  });

  async function resetToken() {
    await flush();
    const email = outbox.find((e) => e.subject === "Choisis un nouveau mot de passe JentApp");
    const response = await follow(linkIn(email!.text));
    const location = new URL(response.headers.get("location")!, "http://localhost:3000");
    expect(location.pathname).toBe("/nouveau-mot-de-passe");
    return location.searchParams.get("token")!;
  }

  it("même réponse que l'email existe ou non", async () => {
    await signUp(valid, new Headers());
    await flush();
    outbox.length = 0;
    expect(await requestPasswordReset({ email: "inconnu@exemple.fr" }, new Headers())).toEqual({
      ok: true,
    });
    expect(await requestPasswordReset({ email: valid.email }, new Headers())).toEqual({ ok: true });
    await flush();
    expect(outbox.map((e) => e.to)).toEqual([valid.email]);
  });

  it("change le mot de passe, ferme les sessions, ne sert qu'une fois", async () => {
    const first = await signUp(valid, new Headers());
    const other = await signIn({ email: valid.email, password: valid.password }, new Headers());
    expect(await getDb().select().from(sessions)).toHaveLength(2);

    await requestPasswordReset({ email: valid.email }, new Headers());
    const token = await resetToken();
    expect(await resetPassword({ token, password: "nouveaumotdepasse" })).toEqual({ ok: true });

    expect(await getDb().select().from(sessions)).toHaveLength(0);
    expect(await getSessionUser(requestHeaders(first.ok ? first.headers : undefined))).toBeNull();
    expect(await getSessionUser(requestHeaders(other.ok ? other.headers : undefined))).toBeNull();

    expect((await signIn({ email: valid.email, password: valid.password }, new Headers())).ok).toBe(
      false,
    );
    expect(
      (await signIn({ email: valid.email, password: "nouveaumotdepasse" }, new Headers())).ok,
    ).toBe(true);

    expect(await resetPassword({ token, password: "encoreunautre" })).toEqual({
      ok: false,
      formError: "Ce lien n'est plus valable. Demande-en un nouveau.",
    });
  });

  it("le lien expire après 1 heure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await signUp(valid, new Headers());
    await requestPasswordReset({ email: valid.email }, new Headers());
    const token = await resetToken();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1000);
    expect((await resetPassword({ token, password: "nouveaumotdepasse" })).ok).toBe(false);
    vi.useRealTimers();
  });
});
