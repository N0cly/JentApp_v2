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
    await consume(rule, "a", new Date());
    await consume(rule, "a", new Date());
    const error = await consume(rule, "a", new Date()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).status).toBe(429);
    expect((error as RateLimitedError).message).toBe("Trop d'essais. Réessaie dans 10 minutes.");
  });

  it("assertAllowed ne compte rien", async () => {
    await assertAllowed(rule, "a", new Date());
    await assertAllowed(rule, "a", new Date());
    await assertAllowed(rule, "a", new Date());
    await record(rule, "a", new Date());
    await record(rule, "a", new Date());
    await expect(assertAllowed(rule, "a", new Date())).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("une nouvelle fenêtre remet le compteur à zéro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await record(rule, "a", new Date());
    await record(rule, "a", new Date());
    vi.setSystemTime(Date.now() + rule.windowMs + 1);
    await expect(assertAllowed(rule, "a", new Date())).resolves.toBeUndefined();
    expect((await record(rule, "a", new Date())).count).toBe(1);
  });

  it("les sujets sont indépendants et insensibles à la casse", async () => {
    await record(rule, "A@x.fr", new Date());
    await record(rule, "a@x.fr", new Date());
    await expect(assertAllowed(rule, "a@X.fr", new Date())).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    await expect(assertAllowed(rule, "b@x.fr", new Date())).resolves.toBeUndefined();
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
