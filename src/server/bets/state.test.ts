import { describe, expect, it } from "vitest";
import { betState, type BetTimes } from "./state";

const opensAt = new Date("2026-10-10T18:00:00Z");
const closesAt = new Date("2026-10-10T21:30:00Z");
const base: BetTimes = { opensAt, closesAt, resolvedAt: null, settledAt: null, cancelledAt: null };
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

describe("betState", () => {
  it("programmé, ouvert, fermé, aux instants exacts", () => {
    expect(betState(base, ms(opensAt, -1))).toBe("scheduled");
    expect(betState(base, opensAt)).toBe("open");
    expect(betState(base, ms(closesAt, -1))).toBe("open");
    expect(betState(base, closesAt)).toBe("closed");
  });

  it("résultat saisi, réglé, annulé, dans cet ordre de priorité", () => {
    const resolved = { ...base, resolvedAt: ms(closesAt, 60_000) };
    expect(betState(resolved, ms(closesAt, 120_000))).toBe("resolved");
    const settled = { ...resolved, settledAt: ms(closesAt, 700_000) };
    expect(betState(settled, ms(closesAt, 800_000))).toBe("settled");
    expect(betState({ ...settled, cancelledAt: ms(closesAt, 900_000) }, closesAt)).toBe(
      "cancelled",
    );
    expect(betState({ ...base, cancelledAt: ms(opensAt, -5) }, ms(opensAt, -10))).toBe("cancelled");
  });
});
