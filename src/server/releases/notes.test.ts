import { describe, expect, it } from "vitest";
import { listReleases, parseRelease, readRelease, ReleaseFormatError } from "./notes";

const GOOD = `date: 2026-10-10
title: Les stickers arrivent

- Envoie les stickers de ton iPhone dans le chat.
- Une page de maintenance s'affiche pendant les mises à jour.
`;

describe("notes de version", () => {
  it("lit l'en-tête et la liste", () => {
    expect(parseRelease("2.1.0", GOOD)).toEqual({
      version: "2.1.0",
      date: "2026-10-10",
      title: "Les stickers arrivent",
      items: [
        "Envoie les stickers de ton iPhone dans le chat.",
        "Une page de maintenance s'affiche pendant les mises à jour.",
      ],
    });
  });

  it.each([
    ["date absente", GOOD.replace("date: 2026-10-10\n", "")],
    ["date impossible", GOOD.replace("2026-10-10", "2026-02-30")],
    ["titre vide", GOOD.replace("title: Les stickers arrivent", "title: ")],
    ["pas de ligne vide", GOOD.replace("arrivent\n\n", "arrivent\n")],
    ["liste vide", "date: 2026-10-10\ntitle: Rien\n\n"],
    ["plus de 6 lignes", `date: 2026-10-10\ntitle: Trop\n\n${"- Un point.\n".repeat(7)}`],
    ["ligne sans tiret", GOOD.replace("- Envoie", "Envoie")],
    ["ligne vide dans la liste", GOOD.replace("chat.\n", "chat.\n\n")],
  ])("mal formé, %s : erreur", (_, source) => {
    expect(() => parseRelease("2.1.0", source)).toThrow(ReleaseFormatError);
  });

  it("refuse un nom qui n'est pas une version", () => {
    expect(() => parseRelease("2.1", GOOD)).toThrow(ReleaseFormatError);
  });

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
