import { describe, expect, it } from "vitest";
import { boldParts, displayLength } from "@/lib/release-text";
import {
  listReleases,
  parseRelease,
  readRelease,
  releasePushText,
  ReleaseFormatError,
} from "./notes";

const PLAIN = `title: Les stickers arrivent

- Envoie les stickers de ton iPhone dans le chat.
- Une page de maintenance s'affiche pendant les mises à jour.
`;

const RICH = `title: Les stickers arrivent dans le chat
push: Les stickers sont là. Ouvre le chat pour essayer.
intro: Première mise à jour depuis le lancement, avec vos retours.

## Nouveau
- Envoie les **stickers** de ton iPhone dans le chat.
- Une image copiée se colle aussi dans le chat.

## Amélioré
- Une page d'attente remplace l'erreur pendant les mises à jour.

## Corrigé
- Le solde ne clignote plus.
`;

const items = (n: number) => "- Un point.\n".repeat(n);

describe("notes de version : format", () => {
  it("sans rubrique : une simple liste, comme les fichiers déjà écrits", () => {
    expect(parseRelease("2.1.0", PLAIN)).toEqual({
      version: "2.1.0",
      title: "Les stickers arrivent",
      push: null,
      intro: null,
      date: null,
      sections: [
        {
          heading: null,
          items: [
            "Envoie les stickers de ton iPhone dans le chat.",
            "Une page de maintenance s'affiche pendant les mises à jour.",
          ],
        },
      ],
    });
  });

  it("avec rubriques, push et intro", () => {
    const release = parseRelease("2.1.0", RICH);
    expect(release).toMatchObject({
      push: "Les stickers sont là. Ouvre le chat pour essayer.",
      intro: "Première mise à jour depuis le lancement, avec vos retours.",
      date: null,
    });
    expect(release.sections.map((s) => [s.heading, s.items.length])).toEqual([
      ["Nouveau", 2],
      ["Amélioré", 1],
      ["Corrigé", 1],
    ]);
  });

  it("une rubrique seule, n'importe laquelle", () => {
    const release = parseRelease("2.1.1", "title: Correctif\n\n## Corrigé\n- Un point.\n");
    expect(release.sections).toEqual([{ heading: "Corrigé", items: ["Un point."] }]);
  });

  it("en-tête dans n'importe quel ordre, avec une date", () => {
    expect(parseRelease("2.0.0", `date: 2026-10-04\n${PLAIN}`).date).toBe("2026-10-04");
    expect(parseRelease("2.0.0", `intro: Bonjour.\n${PLAIN}`).intro).toBe("Bonjour.");
  });

  it("limites atteintes sans être dépassées : accepté", () => {
    const source = `title: ${"t".repeat(60)}\npush: ${"p".repeat(120)}\nintro: ${"i".repeat(200)}\n\n- ${"l".repeat(140)}\n${items(11)}`;
    expect(() => parseRelease("2.1.0", source)).not.toThrow();
    // Les marques de gras ne comptent pas.
    expect(() => parseRelease("2.1.0", `title: T\n\n- **${"l".repeat(140)}**\n`)).not.toThrow();
  });

  it.each([
    ["rubrique inconnue", "title: T\n\n## Divers\n- Un point.\n"],
    ["rubriques dans le désordre", "title: T\n\n## Corrigé\n- Un.\n\n## Nouveau\n- Deux.\n"],
    ["rubrique en double", "title: T\n\n## Nouveau\n- Un.\n## Nouveau\n- Deux.\n"],
    ["rubrique vide", "title: T\n\n## Nouveau\n\n## Corrigé\n- Un.\n"],
    ["dernière rubrique vide", "title: T\n\n## Nouveau\n- Un.\n## Corrigé\n"],
    ["liste avant la première rubrique", "title: T\n\n- Un.\n## Nouveau\n- Deux.\n"],
    ["13 lignes", `title: T\n\n${items(13)}`],
    ["13 lignes réparties", `title: T\n\n## Nouveau\n${items(7)}## Corrigé\n${items(6)}`],
    ["titre de 61 caractères", `title: ${"t".repeat(61)}\n\n- Un point.\n`],
    ["push de 121 caractères", `title: T\npush: ${"p".repeat(121)}\n\n- Un point.\n`],
    ["intro de 201 caractères", `title: T\nintro: ${"i".repeat(201)}\n\n- Un point.\n`],
    ["ligne de 141 caractères", `title: T\n\n- ${"l".repeat(141)}\n`],
    ["titre absent", "push: Coucou\n\n- Un point.\n"],
    ["titre vide", "title: \n\n- Un point.\n"],
    ["champ inconnu", "title: T\nauteur: Nocly\n\n- Un point.\n"],
    ["champ en double", "title: T\ntitle: U\n\n- Un point.\n"],
    ["date impossible", "title: T\ndate: 2026-02-30\n\n- Un point.\n"],
    ["pas de ligne vide", "title: T\n- Un point.\n"],
    ["liste vide", "title: T\n\n"],
    ["ligne sans tiret", "title: T\n\nUn point.\n"],
    ["gras non fermé", "title: T\n\n- Un **point.\n"],
  ])("%s : refusé", (_, source) => {
    expect(() => parseRelease("2.1.0", source)).toThrow(ReleaseFormatError);
  });

  it("refuse un nom qui n'est pas une version", () => {
    expect(() => parseRelease("2.1", PLAIN)).toThrow(ReleaseFormatError);
  });
});

describe("notes de version : texte", () => {
  it("gras : seul **…** est interprété", () => {
    expect(boldParts("Envoie les **stickers** du **chat**.")).toEqual([
      { text: "Envoie les ", bold: false },
      { text: "stickers", bold: true },
      { text: " du ", bold: false },
      { text: "chat", bold: true },
      { text: ".", bold: false },
    ]);
    expect(boldParts("Rien de *spécial* ni de `code`.")).toEqual([
      { text: "Rien de *spécial* ni de `code`.", bold: false },
    ]);
    expect(displayLength("Un **mot**")).toBe(6);
  });

  it("push : celui du fichier, sinon « JentApp {version} : {title} »", () => {
    const release = parseRelease("2.1.0", RICH);
    expect(releasePushText(release)).toBe("Les stickers sont là. Ouvre le chat pour essayer.");
    expect(releasePushText(parseRelease("2.1.0", PLAIN))).toBe(
      "JentApp 2.1.0\u00a0: Les stickers arrivent",
    );
  });
});

describe("notes de version : dépôt", () => {
  it("lit le dépôt : la plus récente d'abord", async () => {
    const releases = await listReleases();
    expect(releases.length).toBeGreaterThan(0);
    expect(await readRelease("2.0.0")).toMatchObject({
      version: "2.0.0",
      title: "La nouvelle JentApp",
    });
    expect(await readRelease("9.9.9")).toBeNull();
  });
});
