// Une note telle que les joueurs la verront, écrite pour le terminal
// (docs/NOUVEAUTES.md, § Aperçu et § Promotion) : version, titre, intro,
// rubriques, texte du push, et le nombre de caractères de chaque champ.
// Sans alias d'import : les scripts chargent ce fichier avec Node.

import { displayLength } from "../../lib/release-text.ts";
import {
  MAX_INTRO_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_PUSH_LENGTH,
  MAX_TITLE_LENGTH,
  releasePushText,
  type Release,
} from "./notes.ts";

const count = (text: string, max: number) => `(${displayLength(text)}/${max})`;

export function releaseForTerminal(release: Release): string {
  const lines = [
    `NOUVEAUTÉS · ${release.version}`,
    `Titre ${count(release.title, MAX_TITLE_LENGTH)} : ${release.title}`,
    release.intro
      ? `Intro ${count(release.intro, MAX_INTRO_LENGTH)} : ${release.intro}`
      : "Intro : aucune",
  ];
  for (const section of release.sections) {
    lines.push("");
    if (section.heading) lines.push(section.heading.toUpperCase());
    for (const item of section.items) lines.push(`  - ${item} ${count(item, MAX_ITEM_LENGTH)}`);
  }
  const push = releasePushText(release);
  lines.push(
    "",
    `Push ${release.push ? "" : "par défaut "}${count(push, MAX_PUSH_LENGTH)} : ${push}`,
  );
  return lines.join("\n");
}
