import { describe, expect, it } from "vitest";
import { weekKey, weekStart } from "./week";

const iso = (d: Date) => d.toISOString();

describe("weekStart", () => {
  it("dimanche 23:59:59 reste dans la semaine, lundi 00:00:00 en ouvre une", () => {
    // Hiver (UTC+1) : dimanche 18 janvier 2026, 23:59:59 à Paris.
    expect(iso(weekStart(new Date("2026-01-18T22:59:59Z")))).toBe("2026-01-11T23:00:00.000Z");
    // Lundi 19 janvier, 00:00:00 à Paris.
    expect(iso(weekStart(new Date("2026-01-18T23:00:00Z")))).toBe("2026-01-18T23:00:00.000Z");
    expect(weekKey(new Date("2026-01-18T22:59:59Z"))).toBe("2026-01-12");
    expect(weekKey(new Date("2026-01-18T23:00:00Z"))).toBe("2026-01-19");
  });

  it("semaine du passage à l'heure d'été (dimanche 29 mars 2026)", () => {
    // Le lundi 23 commence en heure d'hiver, le dimanche 29 finit en heure d'été.
    expect(iso(weekStart(new Date("2026-03-29T21:59:59Z")))).toBe("2026-03-22T23:00:00.000Z");
    expect(iso(weekStart(new Date("2026-03-29T22:00:00Z")))).toBe("2026-03-29T22:00:00.000Z");
    // En pleine nuit du changement d'heure.
    expect(iso(weekStart(new Date("2026-03-29T01:30:00Z")))).toBe("2026-03-22T23:00:00.000Z");
  });

  it("semaine du passage à l'heure d'hiver (dimanche 25 octobre 2026)", () => {
    expect(iso(weekStart(new Date("2026-10-25T22:59:59Z")))).toBe("2026-10-18T22:00:00.000Z");
    expect(iso(weekStart(new Date("2026-10-25T23:00:00Z")))).toBe("2026-10-25T23:00:00.000Z");
    expect(iso(weekStart(new Date("2026-10-25T00:30:00Z")))).toBe("2026-10-18T22:00:00.000Z");
    expect(weekKey(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });

  it("au milieu de la semaine", () => {
    expect(iso(weekStart(new Date("2026-10-02T12:00:00Z")))).toBe("2026-09-27T22:00:00.000Z");
  });
});
