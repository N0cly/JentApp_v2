import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { signupsClosed } from "@/server/env";
import { resetDb } from "@/test/db";
import { getAuth } from "./auth";
import { signUp } from "./accounts";
import { messages } from "./validation";

const valid = { username: "Nocly", email: "nocly@exemple.fr", password: "motdepasse", terms: true };

describe("inscriptions fermées (SIGNUPS=closed)", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllEnvs());

  it("ouvertes sans SIGNUPS, comme en production", async () => {
    vi.stubEnv("SIGNUPS", "");
    expect(signupsClosed()).toBe(false);
    expect((await signUp(valid, new Headers(), new Date())).ok).toBe(true);
  });

  it("le formulaire est refusé côté serveur, aucun compte créé", async () => {
    vi.stubEnv("SIGNUPS", "closed");
    expect(await signUp(valid, new Headers(), new Date())).toEqual({
      ok: false,
      formError: messages.signupsClosed,
    });
    expect(await getDb().select().from(users)).toEqual([]);
  });

  it("l'API d'authentification appelée directement refuse aussi", async () => {
    vi.stubEnv("SIGNUPS", "closed");
    const response = await getAuth().handler(
      new Request(`${process.env.APP_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: process.env.APP_URL! },
        body: JSON.stringify({
          name: "Intrus",
          email: "intrus@exemple.fr",
          password: "motdepasse",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await getDb().select().from(users)).toEqual([]);
  });
});
