// Aperçu des nouveautés sur la validation (docs/NOUVEAUTES.md, § Aperçu) :
// réarme la feuille « Quoi de neuf » des comptes gardés et, sur demande,
// leur renvoie la notification et le push de la version. Refuse de tourner
// hors validation. Les autres comptes ne sont jamais touchés.
// Sans alias d'import : scripts/release-preview.ts charge ce fichier avec Node.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationPayload } from "../../lib/notification-text.ts";
import { compareVersions } from "../../lib/semver.ts";
import { notify } from "../realtime/notify.ts";
import { assertValidation } from "../validation/scrub.ts";
import type { Release } from "./notes.ts";

type Db = PostgresJsDatabase<Record<string, unknown>>;

/** Version d'où la feuille repart : celle qui précède parmi les notes, sinon 0.0.0. */
export function previousVersion(version: string, versions: string[]): string {
  const older = versions.filter((v) => compareVersions(v, version) < 0);
  return older.sort(compareVersions).at(-1) ?? "0.0.0";
}

export type PreviewReport = {
  /** Comptes gardés trouvés, réarmés. */
  accounts: number;
  /** Notifications recréées (--push), une par compte gardé. */
  notifications: number;
  /** Comptes gardés qui ont un appareil abonné au push. */
  pushSubscribers: number;
};

/**
 * Remet `last_seen_release` des comptes gardés à `previous` ; avec `push`,
 * recrée pour eux seuls la notification de la version et la signale avec
 * `force` : l'app envoie le push même si elle est ouverte. Une note en
 * `push: aucun` n'envoie rien : la notification et la feuille seulement.
 */
export async function previewRelease(
  db: Db,
  release: Pick<Release, "version" | "title" | "push"> & Partial<Pick<Release, "silent">>,
  previous: string,
  keep: string[],
  {
    push = false,
    env = process.env,
  }: { push?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<PreviewReport> {
  assertValidation(env);
  // Les emails n'ont pas de virgule : une seule chaîne, découpée par Postgres.
  const kept = sql`string_to_array(${keep.map((e) => e.toLowerCase()).join(",")}, ',')`;
  return db.transaction(async (tx) => {
    const accounts = await tx.execute<{ id: string }>(sql`
      update users set last_seen_release = ${previous}
      where lower(email) = any(${kept}) and deleted_at is null
      returning id
    `);
    const [reach] = await tx.execute<{ n: number }>(sql`
      select count(distinct p.user_id)::int as n
      from push_subscriptions p join users u on u.id = p.user_id
      where lower(u.email) = any(${kept}) and u.deleted_at is null
    `);
    let notifications = 0;
    if (push && accounts.length > 0) {
      const payload: NotificationPayload = {
        type: "release",
        version: release.version,
        title: release.title,
        ...(release.push ? { push: release.push } : {}),
        ...(release.silent ? { silent: true } : {}),
      };
      await tx.execute(sql`
        delete from notifications
        where type = 'release' and payload->>'version' = ${release.version}
          and user_id in (select id from users where lower(email) = any(${kept}))
      `);
      const rows = await tx.execute<{ id: string; user_id: string }>(sql`
        insert into notifications (user_id, league_id, type, payload)
        select id, null, 'release', ${JSON.stringify(payload)}::jsonb
        from users
        where lower(email) = any(${kept}) and deleted_at is null
        returning id, user_id
      `);
      for (const r of rows) {
        await notify(tx, { type: "notification.new", id: r.id, user: r.user_id, force: true });
      }
      notifications = rows.length;
    }
    return { accounts: accounts.length, notifications, pushSubscribers: reach?.n ?? 0 };
  });
}
