// Feuille « Quoi de neuf » (docs/VALIDATION.md, B.5, et docs/NOUVEAUTES.md,
// § Feuille) : toutes les versions que le joueur n'a pas vues, une fois par
// compte, quel que soit l'appareil, puisque l'état est en base.

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { APP_VERSION, compareVersions, isVersion } from "@/lib/version";
import { listReleases, type Release } from "./notes";

/** Versions affichées dans la feuille ; au-delà, « Toutes les nouveautés ». */
export const SHEET_MAX_RELEASES = 3;

/**
 * Les nouveautés à montrer, la plus récente d'abord, trois au plus : les
 * versions plus récentes que la dernière vue, jusqu'à celle de l'app. Un
 * compte sans version notée n'a rien à voir.
 */
export async function pendingReleases(
  user: { id: string },
  current = APP_VERSION,
  dir?: string,
): Promise<Release[]> {
  const [row] = await getDb()
    .select({ seen: users.lastSeenRelease })
    .from(users)
    .where(eq(users.id, user.id));
  const seen = row?.seen;
  if (!seen || !isVersion(seen) || compareVersions(seen, current) >= 0) return [];
  const all = await listReleases(dir);
  return all
    .filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0)
    .slice(0, SHEET_MAX_RELEASES);
}

/** « Compris », la croix ou le fond : tout est lu, sur tous les appareils du compte. */
export async function markReleaseSeen(user: { id: string }, current = APP_VERSION): Promise<void> {
  await getDb().update(users).set({ lastSeenRelease: current }).where(eq(users.id, user.id));
}
