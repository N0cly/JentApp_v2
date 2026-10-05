// Fichiers de stickers qu'aucun message ne cite (docs/STICKERS.md, § Nettoyage).
// Usage : node scripts/stickers-gc.ts               liste les orphelins
//         node scripts/stickers-gc.ts --supprimer   et les supprime
// Dans l'image : docker compose exec app node scripts/stickers-gc.ts [--supprimer]
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  findOrphanStickers,
  GC_GRACE_MS,
  removeOrphanStickers,
} from "../src/server/stickers/gc.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}
const remove = process.argv.includes("--supprimer");
const root = join(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"), "stickers");

const client = postgres(url, { max: 1 });
try {
  const orphans = await findOrphanStickers(drizzle(client), root);
  for (const path of orphans) console.log(path);
  const hours = GC_GRACE_MS / 3_600_000;
  if (orphans.length === 0) {
    console.log(`Aucun sticker orphelin (fichiers de plus de ${hours} h).`);
  } else if (remove) {
    await removeOrphanStickers(root, orphans);
    console.log(`${orphans.length} sticker(s) orphelin(s) supprimé(s).`);
  } else {
    console.log(
      `${orphans.length} sticker(s) orphelin(s). Relancer avec --supprimer pour les effacer.`,
    );
  }
} finally {
  await client.end();
}
