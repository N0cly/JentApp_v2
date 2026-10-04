import { describe, expect, it } from "vitest";
import { APP_VERSION, compareVersions, isVersion } from "./version";

describe("version", () => {
  it("celle de package.json, au format x.y.z", () => {
    expect(isVersion(APP_VERSION)).toBe(true);
  });

  it("compare numériquement, pas comme du texte", () => {
    expect(compareVersions("2.0.0", "2.1.0")).toBeLessThan(0);
    expect(compareVersions("2.10.0", "2.9.3")).toBeGreaterThan(0);
    expect(compareVersions("2.1.1", "2.1.1")).toBe(0);
    expect(() => compareVersions("2.1", "2.1.0")).toThrow();
  });
});
