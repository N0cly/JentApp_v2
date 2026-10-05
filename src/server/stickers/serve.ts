import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { isStickerHash, readStickerFile } from "./files";

// Lecture d'un sticker (docs/STICKERS.md, § Accès) : réservée aux membres de
// la ligue. Le nom est vérifié avant toute lecture en base ou sur le disque.

export const STICKER_HEADERS = {
  "Content-Type": "image/webp",
  // Nom tiré du contenu : il ne change jamais. Privé : jamais dans un cache partagé.
  "Cache-Control": "private, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
} as const;

const notFound = () => new Response("Not found", { status: 404 });

/** Réponse à `GET /api/l/{ligue}/stickers/{nom}` ; 404 pour tout ce qui n'est pas permis. */
export async function stickerResponse(
  user: { id: string } | null,
  leagueId: string,
  name: string,
): Promise<Response> {
  if (!isStickerHash(name)) return notFound();
  if (!user) return notFound();
  try {
    await memberOrNotFound(user.id, leagueId);
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    throw error;
  }
  const data = await readStickerFile(leagueId, name);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), { headers: STICKER_HEADERS });
}
