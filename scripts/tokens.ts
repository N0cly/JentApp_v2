// Génère src/app/tokens.css à partir de design/tokens.json.
// Usage : pnpm tokens
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Token = { name: string; value: string };
type TextStyle = {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
};
type DesignTokens = {
  color: { tokens: Token[] };
  type: {
    families: Record<string, string>;
    groups: { family: string; styles: TextStyle[] }[];
  };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
};

const FONT_VARIABLES: Record<string, string> = {
  display: "--font-display",
  mono: "--font-mono",
};

export function renderTokensCss(tokens: DesignTokens): string {
  const vars = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens]
    .map(({ name, value }) => `  --${name}: ${value};`)
    .join("\n");

  const textUtilities = tokens.type.groups
    .flatMap((group) =>
      group.styles.map((style) => {
        const family = FONT_VARIABLES[group.family];
        if (!family) throw new Error(`Famille inconnue : ${group.family}`);
        const declarations = [
          `font-family: var(${family});`,
          `font-size: ${style.fontSize};`,
          `line-height: ${style.lineHeight};`,
          `font-weight: ${style.fontWeight};`,
          ...(style.letterSpacing ? [`letter-spacing: ${style.letterSpacing};`] : []),
          // docs/design.md : titres en 800 avec font-stretch 85 %.
          ...(group.family === "display" && style.fontWeight === 800 ? ["font-stretch: 85%;"] : []),
          ...(style.name === "overline" ? ["text-transform: uppercase;"] : []),
        ];
        return `@utility text-${style.name} {\n${declarations.map((d) => `  ${d}`).join("\n")}\n}`;
      }),
    )
    .join("\n\n");

  return `/* Généré par \`pnpm tokens\` depuis design/tokens.json. Ne pas modifier à la main. */

:root {
${vars}
}

${textUtilities}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = new URL("../design/tokens.json", import.meta.url);
  const target = new URL("../src/app/tokens.css", import.meta.url);
  const tokens = JSON.parse(readFileSync(source, "utf8")) as DesignTokens;
  writeFileSync(target, renderTokensCss(tokens));
  console.log("src/app/tokens.css généré");
}
