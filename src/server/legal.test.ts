import { describe, expect, it } from "vitest";
import { readLegalPage } from "./legal";

describe("pages légales", () => {
  it.each(["conditions-d-utilisation", "confidentialite", "mentions-legales"] as const)(
    "%s : titre à part, sans la note de brouillon",
    async (page) => {
      const { title, html } = await readLegalPage(page);
      expect(title.length).toBeGreaterThan(0);
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("Brouillon à faire relire");
      expect(html).toContain("<h2");
    },
  );
});
