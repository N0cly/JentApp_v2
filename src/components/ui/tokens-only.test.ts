import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md : aucune couleur, aucun rayon, aucun espacement en dur dans le kit.
const dir = join(process.cwd(), "src/components/ui");
const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

const forbidden: [string, RegExp][] = [
  ["couleur hexadécimale", /#[0-9a-fA-F]{3,8}\b/],
  ["couleur rgb/hsl", /\b(rgba?|hsla?|oklch)\(/],
  ["rayon arbitraire", /\brounded(-[a-z]+)?-\[/],
  [
    "espacement arbitraire",
    /\b-?(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\[(?!calc\(var\(--space-|env\()/,
  ],
  ["couleur arbitraire", /\b(bg|text|border|ring|outline|fill|stroke)-\[#/],
];

describe("kit d'interface", () => {
  it.each(files)("%s n'utilise que des jetons", (file) => {
    const source = readFileSync(join(dir, file), "utf8");
    for (const [name, pattern] of forbidden) {
      expect(source, `${name} dans ${file}`).not.toMatch(pattern);
    }
  });
});
