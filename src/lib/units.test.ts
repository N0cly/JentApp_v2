import { describe, expect, it } from "vitest";
import { breakdown } from "./units";

const labels = (n: number) =>
  breakdown(n)
    .map((p) => p.label)
    .join(" · ");

describe("breakdown", () => {
  it("paquets, puis joints, puis clopes ; unités à zéro omises", () => {
    expect(labels(64)).toBe("3 paquets · 4 clopes");
    expect(labels(25)).toBe("1 paquet · 1 joint");
    expect(labels(47)).toBe("2 paquets · 1 joint · 2 clopes");
    expect(labels(5)).toBe("1 joint");
    expect(labels(11)).toBe("2 joints · 1 clope");
    expect(labels(40)).toBe("2 paquets");
  });

  it("masquée sous 5 clopes", () => {
    expect(breakdown(4)).toEqual([]);
    expect(breakdown(0)).toEqual([]);
  });
});
