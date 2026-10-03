import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// docs/TEXTES.md § 4 : une espace insécable devant « ? ! : ; », pour que le
// signe ne parte pas seul à la ligne. Les questions des joueurs passent par
// frenchSpacing ; les textes fixes l'ont dans le code. Tests et fixtures exclus.
const files = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter(
    (f) =>
      /\.tsx?$/.test(f) &&
      !/\.test\.tsx?$/.test(f) &&
      !f.startsWith("test/") &&
      !f.includes("migrations"),
  )
  .map((f) => join("src", f));

/** Textes du fichier : chaînes, gabarits et texte JSX. */
function texts(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text);
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      found.push(node.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("typographie", () => {
  it.each(files)("%s : espace insécable devant ? ! : ;", (file) => {
    const offending = texts(file).filter((text) => / [?!:;]/.test(text));
    expect(offending, `espace ordinaire devant un signe dans ${file}`).toEqual([]);
  });
});
