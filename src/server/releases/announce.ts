// Annonce automatique d'une nouvelle version (docs/VALIDATION.md, B.7), au
// démarrage de l'app, après les migrations. Une notification `release` par
// compte, la version notée dans app_meta et sa date de mise en ligne dans
// releases, dans une seule transaction sous verrou : deux démarrages
// simultanés n'annoncent qu'une fois.

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { APP_VERSION, compareVersions, isVersion } from "@/lib/version";
import type { NotificationPayload } from "@/lib/notification-text";
import { notify } from "@/server/realtime/notify";
import { readRelease, type Release } from "./notes";

/** Clé d'app_meta : la dernière version annoncée. */
export const RELEASE_META_KEY = "release";
/** Verrou consultatif propre à l'annonce, le temps de la transaction. */
export const RELEASE_LOCK = 7_304_201;

export type AnnounceResult =
  | { kind: "initialized"; version: string }
  | { kind: "announced"; version: string; accounts: number }
  | { kind: "unchanged"; version: string };

/**
 * Annonce `release` si elle est plus récente que la version notée. Rien de
 * noté (premier démarrage) : la version est notée sans annonce.
 */
export async function announceRelease(
  release: Pick<Release, "version" | "title"> & Partial<Pick<Release, "push">>,
): Promise<AnnounceResult> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RELEASE_LOCK})`);
    // Mise en ligne dans cet environnement (docs/NOUVEAUTES.md, § Date) : la
    // première fois que la version démarre, quel que soit le cas ci-dessous.
    await tx.execute(sql`
      insert into releases (version) values (${release.version}) on conflict (version) do nothing
    `);
    const [row] = await tx.execute<{ value: string | null }>(
      sql`select value from app_meta where key = ${RELEASE_META_KEY}`,
    );
    const noted = row?.value ?? null;
    const record = () =>
      tx.execute(sql`
        insert into app_meta (key, value) values (${RELEASE_META_KEY}, ${release.version})
        on conflict (key) do update set value = excluded.value
      `);
    if (!noted || !isVersion(noted)) {
      await record();
      return { kind: "initialized", version: release.version };
    }
    if (compareVersions(release.version, noted) <= 0) {
      return { kind: "unchanged", version: noted };
    }
    const payload: NotificationPayload = {
      type: "release",
      version: release.version,
      title: release.title,
      ...(release.push ? { push: release.push } : {}),
    };
    const rows = await tx.execute<{ id: string; user_id: string }>(sql`
      insert into notifications (user_id, league_id, type, payload)
      select id, null, 'release', ${JSON.stringify(payload)}::jsonb
      from users
      where deleted_at is null
      returning id, user_id
    `);
    // Signal reçu à la validation : le push part alors, comme pour toute notification.
    for (const r of rows) await notify(tx, { type: "notification.new", id: r.id, user: r.user_id });
    await record();
    return { kind: "announced", version: release.version, accounts: rows.length };
  });
}

/** Au démarrage : annonce la version de l'app, d'après sa note. */
export async function announceCurrentRelease(): Promise<AnnounceResult | null> {
  const release = await readRelease(APP_VERSION);
  if (!release) {
    console.warn(`Notes de la version ${APP_VERSION} introuvables : pas d'annonce.`);
    return null;
  }
  return announceRelease(release);
}
