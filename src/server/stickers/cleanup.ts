import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { messages } from "@/db/schema";
import { removeLeagueStickerDir, removeStickerFile } from "./files";

// Nettoyage des fichiers (docs/STICKERS.md, § Nettoyage). Appelé après la
// transaction qui retire le message, le compte ou la ligue : un fichier ne
// disparaît jamais avant que plus rien ne le cite.

export type StickerRef = { leagueId: string; hash: string };

/** Supprime chaque fichier qu'aucun message visible de sa ligue ne cite plus. */
export async function removeUnusedStickers(refs: StickerRef[]) {
  const unique = new Map(refs.map((r) => [`${r.leagueId}/${r.hash}`, r]));
  for (const { leagueId, hash } of unique.values()) {
    const [cited] = await getDb()
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.leagueId, leagueId),
          eq(messages.kind, "sticker"),
          isNull(messages.deletedAt),
          sql`${messages.data}->>'hash' = ${hash}`,
        ),
      )
      .limit(1);
    if (!cited) await removeStickerFile(leagueId, hash);
  }
}

/** Le dossier des stickers d'une ligue supprimée. */
export async function removeLeagueStickers(leagueIds: string[]) {
  for (const leagueId of leagueIds) await removeLeagueStickerDir(leagueId);
}

/** Empreinte d'un message sticker, d'après sa colonne `data`. */
export function stickerRef(row: {
  leagueId: string;
  kind: string;
  data: unknown;
}): StickerRef | null {
  if (row.kind !== "sticker") return null;
  const hash = (row.data as { hash?: unknown } | null)?.hash;
  return typeof hash === "string" ? { leagueId: row.leagueId, hash } : null;
}
