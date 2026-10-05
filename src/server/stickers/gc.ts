import { readdir, rm, rmdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Fichiers de stickers qu'aucun message ne cite (docs/STICKERS.md, § Nettoyage) :
// envois interrompus entre l'écriture du fichier et la transaction, ou
// nettoyage manqué. Sans alias d'import : scripts/stickers-gc.ts charge ce
// fichier directement avec Node, dans l'image.

/** Un fichier plus récent peut appartenir à un envoi en cours : on le laisse. */
export const GC_GRACE_MS = 60 * 60 * 1000;

const STICKER_FILE = /^([0-9a-f]{64})\.webp$/;
const TEMPORARY_FILE = /^[0-9a-f]{64}\.webp\..+\.tmp$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Db = Pick<PostgresJsDatabase<Record<string, unknown>>, "execute">;

/** Chemins des fichiers orphelins sous `root` (uploads/stickers), du plus ancien au plus récent. */
export async function findOrphanStickers(db: Db, root: string, now = new Date()) {
  const rows = await db.execute<{ league_id: string; hash: string }>(sql`
    select distinct league_id::text as league_id, data->>'hash' as hash
    from messages
    where kind = 'sticker' and deleted_at is null
  `);
  const cited = new Set(rows.map((r) => `${r.league_id}/${r.hash}`));

  let leagues: string[];
  try {
    leagues = await readdir(root);
  } catch {
    return [];
  }
  const orphans: { path: string; mtime: number }[] = [];
  for (const league of leagues.filter((name) => UUID.test(name))) {
    for (const name of await readdir(join(root, league))) {
      const sticker = STICKER_FILE.exec(name);
      if (!sticker && !TEMPORARY_FILE.test(name)) continue;
      if (sticker && cited.has(`${league}/${sticker[1]}`)) continue;
      const path = join(root, league, name);
      const { mtimeMs } = await stat(path);
      if (now.getTime() - mtimeMs < GC_GRACE_MS) continue;
      orphans.push({ path, mtime: mtimeMs });
    }
  }
  return orphans.sort((a, b) => a.mtime - b.mtime).map((o) => o.path);
}

/** Supprime les fichiers donnés, puis les dossiers de ligue restés vides. */
export async function removeOrphanStickers(root: string, paths: string[]) {
  for (const path of paths) await rm(path, { force: true });
  let leagues: string[] = [];
  try {
    leagues = await readdir(root);
  } catch {
    return;
  }
  for (const league of leagues.filter((name) => UUID.test(name))) {
    const dir = join(root, league);
    if ((await readdir(dir)).length === 0) await rmdir(dir);
  }
}
