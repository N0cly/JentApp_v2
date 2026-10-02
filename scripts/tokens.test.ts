import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderTokensCss } from "./tokens";

const tokens = JSON.parse(readFileSync("design/tokens.json", "utf8"));

describe("renderTokensCss", () => {
  it("expose chaque jeton en variable CSS", () => {
    const css = renderTokensCss(tokens);
    expect(css).toContain("--bg: #0d1013;");
    expect(css).toContain("--space-4: 16px;");
    expect(css).toContain("--radius-lg: 20px;");
  });

  it("met les titres en 85 % et l'overline en capitales", () => {
    const css = renderTokensCss(tokens);
    expect(css).toMatch(/@utility text-title \{[^}]*font-stretch: 85%;/);
    expect(css).toMatch(/@utility text-overline \{[^}]*text-transform: uppercase;/);
  });

  it("correspond au fichier versionné", () => {
    expect(readFileSync("src/app/tokens.css", "utf8")).toBe(renderTokensCss(tokens));
  });
});
