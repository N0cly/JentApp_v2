import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/AUTOMATISATION.md, A.7 : chaque lundi, vers develop, mineures et
// correctives regroupées, 5 demandes ouvertes au plus, 7 jours de délai.
const config = readFileSync(".github/dependabot.yml", "utf8");
const entries = config.split(/\n {2}- package-ecosystem: /).slice(1);

describe("dependabot.yml", () => {
  it("couvre pnpm, les actions GitHub et les images Docker", () => {
    expect(entries.map((e) => e.split("\n")[0])).toEqual([
      "npm",
      "github-actions",
      "docker",
      "docker-compose",
    ]);
  });

  it.each(entries.map((e) => [e.split("\n")[0], e]))(
    "%s : lundi matin, vers develop, 7 jours, mineures et correctives groupées",
    (_, entry) => {
      expect(entry).toContain("target-branch: develop");
      expect(entry).toMatch(/interval: weekly\n\s+day: monday\n\s+time: "07:00"/);
      expect(entry).toMatch(/cooldown:\n\s+default-days: 7/);
      expect(entry).toContain("update-types: [minor, patch]");
      expect(entry).not.toContain("major");
    },
  );

  it("cinq demandes ouvertes au plus, en tout", () => {
    const limits = [...config.matchAll(/open-pull-requests-limit: (\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(limits).toHaveLength(entries.length);
    expect(limits.reduce((a, b) => a + b, 0)).toBe(5);
  });
});
