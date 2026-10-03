import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { achievements, cosmetics } from "@/db/schema";
import { resetDb } from "@/test/db";

describe("catalogue de départ", () => {
  beforeEach(resetDb);

  it("six bordures aux couleurs et prix des maquettes, aucun avatar", async () => {
    const rows = await getDb().select().from(cosmetics).orderBy(asc(cosmetics.position));
    expect(rows.map((r) => [r.type, r.name, r.tintColor, r.price, r.active])).toEqual([
      ["border", "Laiton", "#F2B632", 0, true],
      ["border", "Zinc", "#A9B0B8", 20, true],
      ["border", "Carotte", "#F4776A", 30, true],
      ["border", "Enseigne", "#3DDC97", 40, true],
      ["border", "Papier", "#F3F1E7", 60, true],
      ["border", "Nuit", "#66717E", 80, true],
    ]);
  });

  it("douze succès, 140 clopes au total, deux cachés", async () => {
    const rows = await getDb().select().from(achievements).orderBy(asc(achievements.position));
    expect(rows).toHaveLength(12);
    expect(rows.reduce((sum, r) => sum + r.reward, 0)).toBe(140);
    expect(rows.filter((r) => r.hidden).map((r) => r.key)).toEqual(["all_in", "broke"]);
    expect(rows.map((r) => [r.key, r.ruleType, r.ruleValue])).toContainEqual([
      "high_roller",
      "single_stake",
      20,
    ]);
  });
});
