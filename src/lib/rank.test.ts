import { describe, expect, it } from "vitest";
import { rankLabel } from "./rank";
import { countOf } from "./units";

describe("libellés", () => {
  it("rangs : 1er, 2e, 3e", () => {
    expect([1, 2, 3, 11].map(rankLabel)).toEqual(["1er", "2e", "3e", "11e"]);
  });

  it("clopes au pluriel au-delà de 1", () => {
    expect([0, 1, 2, 21].map((n) => countOf(n))).toEqual([
      "0 clope",
      "1 clope",
      "2 clopes",
      "21 clopes",
    ]);
  });
});
