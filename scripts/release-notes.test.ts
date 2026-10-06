import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// docs/NOUVEAUTES.md, § Promotion : promote.sh affiche, depuis l'image validée,
// les notes des versions entre la production et la validation.
function notes(...args: string[]) {
  try {
    const stdout = execFileSync("node", ["scripts/release-notes.ts", ...args], {
      stdio: "pipe",
    }).toString();
    return { code: 0, stdout };
  } catch (error) {
    const e = error as { status: number; stdout: Buffer };
    return { code: e.status, stdout: e.stdout.toString() };
  }
}

describe("release-notes.ts", () => {
  it("les versions après --after jusqu'à la version, la plus récente d'abord, puis son push", () => {
    const { code, stdout } = notes("--after", "1.0.0", "2.1.0");
    expect(code).toBe(0);
    expect(stdout.indexOf("NOUVEAUTÉS · 2.1.0")).toBeLessThan(stdout.indexOf("NOUVEAUTÉS · 2.0.0"));
    expect(stdout.match(/^Push/gm)).toHaveLength(1);
    expect(stdout.trimEnd().split("\n").at(-1)).toMatch(/^Push .*/);
  });

  it("sans --after : la note de la version seule", () => {
    const { stdout } = notes("2.1.0");
    expect(stdout).toContain("NOUVEAUTÉS · 2.1.0");
    expect(stdout).not.toContain("NOUVEAUTÉS · 2.0.0");
  });

  it("--title : le titre seul ; version sans note : erreur", () => {
    expect(notes("--title", "2.0.0").stdout.trim()).toBe("La nouvelle JentApp");
    expect(notes("9.9.9").code).not.toBe(0);
    expect(notes("--silent", "2.1.0").stdout.trim()).toBe("non");
  });
});
