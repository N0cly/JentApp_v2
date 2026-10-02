import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Marked, type Tokens } from "marked";

export type LegalPage = "conditions-d-utilisation" | "confidentialite" | "mentions-legales";

const marked = new Marked({
  renderer: {
    // Le titre va dans la barre du haut ; la citation est une note pour les relecteurs.
    heading({ tokens, depth }: Tokens.Heading) {
      if (depth === 1) return "";
      return `<h2 class="mt-2 text-[17px] leading-[22px] font-bold text-ink">${this.parser.parseInline(tokens)}</h2>`;
    },
    blockquote() {
      return "";
    },
    paragraph({ tokens }: Tokens.Paragraph) {
      return `<p class="text-[14px] leading-5 text-ink-muted">${this.parser.parseInline(tokens)}</p>`;
    },
    list(token: Tokens.List) {
      const items = token.items
        .map((item) => `<li>${this.parser.parse(item.tokens)}</li>`)
        .join("");
      const tag = token.ordered ? "ol" : "ul";
      return `<${tag} class="flex list-disc flex-col gap-1 pl-5 text-[14px] leading-5 text-ink-muted">${items}</${tag}>`;
    },
    link({ href, tokens }: Tokens.Link) {
      return `<a href="${href}" class="font-semibold text-brand">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

/** Page légale : titre et corps HTML, depuis content/legal/*.md (contenu du dépôt). */
export async function readLegalPage(page: LegalPage): Promise<{ title: string; html: string }> {
  const source = await readFile(join(process.cwd(), "content/legal", `${page}.md`), "utf8");
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  return { title, html: await marked.parse(source) };
}
