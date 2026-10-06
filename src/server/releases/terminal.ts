// Une note telle que les joueurs la verront, écrite pour le terminal
// (docs/NOUVEAUTES.md, § Aperçu et § Promotion) : version, titre, intro,
// rubriques, texte du push, et le nombre de caractères de chaque champ.
// Les textes passent par frenchSpacing, comme à l'écran.
// Sans alias d'import : les scripts chargent ce fichier avec Node.

import { displayLength } from "../../lib/release-text.ts";
import { frenchSpacing } from "../../lib/typo.ts";
import {
  MAX_INTRO_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_PUSH_LENGTH,
  MAX_TITLE_LENGTH,
  releasePushText,
  type Release,
} from "./notes.ts";

const count = (text: string, max: number) => `(${displayLength(text)}/${max})`;

/** `push: false` : sans la ligne du push, pour une version qui n'est pas annoncée. */
export function releaseForTerminal(release: Release, { push = true } = {}): string {
  const lines = [
    `NOUVEAUTÉS · ${release.version}`,
    `Titre ${count(release.title, MAX_TITLE_LENGTH)} : ${frenchSpacing(release.title)}`,
    release.intro
      ? `Intro ${count(release.intro, MAX_INTRO_LENGTH)} : ${frenchSpacing(release.intro)}`
      : "Intro : aucune",
  ];
  for (const section of release.sections) {
    lines.push("");
    if (section.heading) lines.push(frenchSpacing(section.heading).toUpperCase());
    for (const item of section.items)
      lines.push(`  - ${frenchSpacing(item)} ${count(item, MAX_ITEM_LENGTH)}`);
  }
  if (push) lines.push("", pushLine(release));
  return lines.join("\n");
}

/** Le texte du push et de la notification, avec son nombre de caractères. */
export function pushLine(release: Release): string {
  const text = releasePushText(release);
  return `Push ${release.push ? "" : "par défaut "}${count(text, MAX_PUSH_LENGTH)} : ${frenchSpacing(text)}`;
}
