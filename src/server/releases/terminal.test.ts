import { describe, expect, it } from "vitest";
import { parseRelease } from "./notes";
import { releaseForTerminal } from "./terminal";

describe("note dans le terminal", () => {
  it("version, titre, intro, rubriques et push, avec le nombre de caractères", () => {
    const release = parseRelease(
      "2.1.0",
      "title: Les stickers\npush: Ouvre le chat.\nintro: Une phrase.\n\n## Nouveau\n- Un **point**.\n\n## Corrigé\n- Deux.\n",
    );
    expect(releaseForTerminal(release).split("\n")).toEqual([
      "NOUVEAUTÉS · 2.1.0",
      "Titre (12/60) : Les stickers",
      "Intro (11/200) : Une phrase.",
      "",
      "NOUVEAU",
      "  - Un **point**. (9/140)",
      "",
      "CORRIGÉ",
      "  - Deux. (5/140)",
      "",
      "Push (14/120) : Ouvre le chat.",
    ]);
  });

  it("textes passés par frenchSpacing, comme à l'écran", () => {
    const text = releaseForTerminal(
      parseRelease("2.1.0", "title: Enfin !\n\n## Soon ?\n- Bientôt : la suite.\n"),
    );
    expect(text).toContain("Titre (7/60)\u00a0: Enfin\u00a0!");
    expect(text).toContain("SOON\u00a0?");
    expect(text).toContain("  - Bientôt\u00a0: la suite. (19/140)");
  });

  it("push: aucun : le terminal le dit", () => {
    const text = releaseForTerminal(parseRelease("2.1.1", "title: T\npush: aucun\n\n- Un.\n"));
    expect(text.split("\n").at(-1)).toBe(
      "Push\u00a0: aucun, la version s'annonce par la feuille et le centre",
    );
  });

  it("sans intro ni push ni rubrique : le push par défaut", () => {
    const text = releaseForTerminal(parseRelease("2.1.1", "title: Correctif\n\n- Un point.\n"));
    expect(text).toContain("Intro : aucune");
    expect(text).toContain("\n  - Un point. (9/140)\n");
    expect(text).toContain("Push par défaut (25/120) : JentApp 2.1.1 : Correctif");
  });
});
