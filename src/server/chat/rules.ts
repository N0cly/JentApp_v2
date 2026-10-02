// Messages : docs/M4.md, § Messages d'erreur ; voix de docs/design.md pour les autres.
export const chatMessages = {
  tooLong: (extra: number) => `500 caractères au plus. Il y en a ${extra} de trop.`,
  empty: "Écris quelque chose avant d'envoyer.",
  tooFast: "Doucement. Réessaie dans un instant.",
  badGif: "Ce GIF ne vient pas de Giphy.",
} as const;

export const MAX_LENGTH = 500;
export const PAGE_SIZE = 50;

/** Espaces nettoyés, sauts de ligne conservés (au plus une ligne vide d'affilée). */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MENTION = /@([\p{L}\p{M}\p{N}_-]{3,20})/gu;

/** Pseudos cités par `@pseudo` dans un texte, sans doublon (casse ignorée). */
export function mentionedNames(text: string): string[] {
  const seen = new Map<string, string>();
  for (const match of text.matchAll(MENTION)) {
    const name = match[1]!;
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

/** URL d'un GIF accepté : https, sur un hôte en .giphy.com. */
export function isGiphyUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".giphy.com") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
