import { describe, expect, it } from "vitest";
import { releaseDate } from "./date";

describe("date d'une note", () => {
  it("jour, mois en toutes lettres, année, sans décalage de fuseau", () => {
    expect(releaseDate("2026-10-04")).toBe("4 octobre 2026");
    expect(releaseDate("2027-01-01")).toBe("1 janvier 2027");
  });
});
