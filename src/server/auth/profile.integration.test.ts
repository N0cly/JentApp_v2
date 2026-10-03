import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { outbox } from "@/server/email";
import { resetDb } from "@/test/db";
import { linkIn, requestHeaders } from "@/test/http";
import { getAuth } from "./auth";
import { getSessionUser, signIn, signUp } from "./accounts";
import { changePassword, changeUsername, requestEmailChange } from "./profile";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function account(username: string, email: string) {
  const result = await signUp(
    { username, email, password: "motdepasse", terms: true },
    new Headers(),
    new Date(),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const [user] = await getDb().select().from(users).where(eq(users.email, email));
  return { user: user!, headers: requestHeaders(result.headers) };
}

describe("compte", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
  });

  it("pseudo : mêmes règles qu'à l'inscription", async () => {
    const a = await account("Alpha", "a@exemple.fr");
    await account("Bravo", "b@exemple.fr");
    expect(await changeUsername(a.user.id, { username: "x" })).toEqual({
      ok: false,
      fieldErrors: { username: "3 à 20 caractères : lettres, chiffres, _ et -." },
    });
    expect(await changeUsername(a.user.id, { username: "BRAVO" })).toEqual({
      ok: false,
      fieldErrors: { username: "Ce pseudo est déjà pris." },
    });
    // Changer la casse de son propre pseudo est permis.
    expect(await changeUsername(a.user.id, { username: "ALPHA" })).toEqual({ ok: true });
    expect((await getSessionUser(a.headers))?.username).toBe("ALPHA");
  });

  it("email : remplacé seulement après le lien envoyé à la nouvelle adresse", async () => {
    const a = await account("Alpha", "a@exemple.fr");
    await account("Bravo", "b@exemple.fr");
    await flush();
    outbox.length = 0;

    expect(await requestEmailChange({ email: "b@exemple.fr" }, a.headers)).toEqual({
      ok: false,
      fieldErrors: { email: "Un compte existe déjà avec cet email." },
    });
    expect(await requestEmailChange({ email: "nouveau@exemple.fr" }, a.headers)).toEqual({
      ok: true,
    });
    await flush();
    expect((await getSessionUser(a.headers))?.email).toBe("a@exemple.fr");
    const mail = outbox.find((m) => m.to === "nouveau@exemple.fr");
    expect(mail?.subject).toBe("Confirme ton email JentApp");

    await getAuth().handler(new Request(linkIn(mail!.text), { headers: a.headers }));
    expect((await getSessionUser(a.headers))?.email).toBe("nouveau@exemple.fr");
  });

  it("mot de passe : demande l'actuel et ferme les autres sessions", async () => {
    const a = await account("Alpha", "a@exemple.fr");
    const other = await signIn(
      { email: "a@exemple.fr", password: "motdepasse" },
      new Headers(),
      new Date(),
    );
    expect(
      await changePassword(
        { currentPassword: "mauvais!!", newPassword: "nouveaumotdepasse" },
        a.headers,
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Ce n'est pas ton mot de passe actuel." },
    });
    const done = await changePassword(
      { currentPassword: "motdepasse", newPassword: "nouveaumotdepasse" },
      a.headers,
    );
    expect(done.ok).toBe(true);
    expect(await getSessionUser(requestHeaders(other.ok ? other.headers : undefined))).toBeNull();
    expect(await getDb().select().from(sessions)).toHaveLength(1);
    expect(
      (
        await signIn(
          { email: "a@exemple.fr", password: "nouveaumotdepasse" },
          new Headers(),
          new Date(),
        )
      ).ok,
    ).toBe(true);
  });
});
