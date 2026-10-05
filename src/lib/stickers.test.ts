import { describe, expect, it, vi } from "vitest";
import { interceptStickerPaste, pastedImage } from "./stickers";

// docs/STICKERS.md, § Saisie et § Tests (Saisie).
const png = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
const gif = new File([new Uint8Array([4])], "anim.gif", { type: "image/gif" });
const pdf = new File([new Uint8Array([5])], "doc.pdf", { type: "application/pdf" });

function paste(clipboardData: Parameters<typeof pastedImage>[0]) {
  const preventDefault = vi.fn();
  const image = interceptStickerPaste({ clipboardData: clipboardData ?? null, preventDefault });
  return { image, prevented: preventDefault.mock.calls.length > 0 };
}

const textItem = { kind: "string", type: "text/plain", getAsFile: () => null };

describe("collage dans le champ du chat", () => {
  it("un collage de texte n'est pas intercepté", () => {
    expect(paste({ files: [], items: [textItem] })).toEqual({ image: null, prevented: false });
    expect(paste(null)).toEqual({ image: null, prevented: false });
  });

  it("un collage d'image est intercepté : rien n'est inséré, l'image est retenue", () => {
    expect(paste({ files: [png], items: [] })).toEqual({ image: png, prevented: true });
  });

  it("sticker de l'iPhone dans un champ de texte : fichier image.png", () => {
    // Relevé sur /kit/stickers : `paste` porte le fichier, même dans un textarea.
    expect(paste({ files: [png], items: [textItem] }).image?.name).toBe("image.png");
  });

  it("plusieurs fichiers : la première image", () => {
    expect(paste({ files: [pdf, gif, png], items: [] }).image).toBe(gif);
  });

  it("un fichier qui n'est pas une image n'est pas intercepté", () => {
    expect(paste({ files: [pdf], items: [] })).toEqual({ image: null, prevented: false });
  });

  it("image seulement dans items : retenue", () => {
    const item = { kind: "file", type: "image/png", getAsFile: () => png };
    expect(paste({ files: [], items: [textItem, item] })).toEqual({ image: png, prevented: true });
  });
});
