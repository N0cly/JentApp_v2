// Texte d'une note de version (docs/NOUVEAUTES.md, § Format) : texte brut, où
// seul **gras** est interprété. Partagé : le serveur compte, l'écran affiche.

/** Morceaux d'une ligne : texte normal et texte en gras, en alternance. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}

/** Longueur affichée : en caractères, sans les marques de **gras**. */
export function displayLength(text: string): number {
  return [...text.replaceAll("**", "")].length;
}
