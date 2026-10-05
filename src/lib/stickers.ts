// Stickers du chat (docs/STICKERS.md), partagé entre le serveur et la saisie.

export const MAX_STICKER_BYTES = 5 * 1024 * 1024;

// Messages : docs/STICKERS.md, § Messages.
export const stickerMessages = {
  tooLarge: "Image trop lourde : 5 Mo au plus.",
  badFormat: "Ce format n'est pas accepté. Essaie un autre sticker.",
  unreadable: "Impossible de lire cette image.",
  failed: "Le sticker n'est pas parti. Réessaie.",
} as const;

type Clipboard = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
};

/** Première image d'un collage, ou null : un collage de texte reste un collage de texte. */
export function pastedImage(data: Clipboard | null | undefined): File | null {
  if (!data) return null;
  const files = Array.from(data.files ?? []);
  const image = files.find((file) => file.type.startsWith("image/"));
  if (image) return image;
  // Certains navigateurs ne remplissent que `items`.
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

/**
 * Collage dans le champ du chat (§ Saisie) : s'il porte une image, le collage
 * par défaut est annulé et l'image est rendue ; sinon rien ne change.
 */
export function interceptStickerPaste(event: {
  clipboardData: Clipboard | null;
  preventDefault(): void;
}): File | null {
  const image = pastedImage(event.clipboardData);
  if (image) event.preventDefault();
  return image;
}
