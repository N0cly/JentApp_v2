import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

describe("checkHealth", () => {
  it("répond ok quand la base répond", async () => {
    const health = await checkHealth(async () => [{ "?column?": 1 }]);
    expect(health).toEqual({ httpStatus: 200, body: { status: "ok", db: "ok", version } });
  });

  it("répond 503 quand la base échoue", async () => {
    const health = await checkHealth(async () => {
      throw new Error("connection refused");
    });
    expect(health.httpStatus).toBe(503);
    expect(health.body.version).toBe(version);
  });

  it("répond 503 quand la base ne répond pas à temps", async () => {
    const health = await checkHealth(() => new Promise(() => {}), 20);
    expect(health.httpStatus).toBe(503);
  });
});
