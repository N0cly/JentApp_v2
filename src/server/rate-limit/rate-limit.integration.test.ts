import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/test/db";
import { assertAllowed, clientIp, consume, RateLimitedError, rateLimitMessage, record } from ".";

const rule = { name: "test", limit: 2, windowMs: 10 * 60 * 1000 };

describe("rate-limit", () => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("refuse au-delà du quota, avec le délai restant", async () => {
    await consume(rule, "a");
    await consume(rule, "a");
    const error = await consume(rule, "a").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).status).toBe(429);
    expect((error as RateLimitedError).message).toBe("Trop d'essais. Réessaie dans 10 minutes.");
  });

  it("assertAllowed ne compte rien", async () => {
    await assertAllowed(rule, "a");
    await assertAllowed(rule, "a");
    await assertAllowed(rule, "a");
    await record(rule, "a");
    await record(rule, "a");
    await expect(assertAllowed(rule, "a")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("une nouvelle fenêtre remet le compteur à zéro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await record(rule, "a");
    await record(rule, "a");
    vi.setSystemTime(Date.now() + rule.windowMs + 1);
    await expect(assertAllowed(rule, "a")).resolves.toBeUndefined();
    expect((await record(rule, "a")).count).toBe(1);
  });

  it("les sujets sont indépendants et insensibles à la casse", async () => {
    await record(rule, "A@x.fr");
    await record(rule, "a@x.fr");
    await expect(assertAllowed(rule, "a@X.fr")).rejects.toBeInstanceOf(RateLimitedError);
    await expect(assertAllowed(rule, "b@x.fr")).resolves.toBeUndefined();
  });

  it("message au singulier pour une minute", () => {
    expect(rateLimitMessage(30_000)).toBe("Trop d'essais. Réessaie dans 1 minute.");
  });

  it("ne lit X-Forwarded-For que derrière un proxy de confiance", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.4" });
    expect(clientIp(headers)).toBe("local");
    vi.stubEnv("TRUST_PROXY", "true");
    expect(clientIp(headers)).toBe("203.0.113.4");
  });
});
