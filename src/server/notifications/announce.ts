// Annonce à tous les joueurs (docs/ANNONCE.md) : une ligne par compte non
// supprimé, dans une seule transaction, puis `notification.new`. C'est l'app
// en cours d'exécution qui envoie le push, à la réception du signal.
// Sans alias d'import : scripts/announce.ts charge ce fichier directement avec Node.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationPayload } from "../../lib/notification-text.ts";
import { notify } from "../realtime/notify.ts";

export const ANNOUNCEMENT_MAX_LENGTH = 200;

export class AnnouncementError extends Error {}

/** Le message tel qu'il partira : de 1 à 200 caractères, sinon erreur. */
export function announcementMessage(input: unknown): string {
  const message = typeof input === "string" ? input.trim() : "";
  const length = [...message].length;
  if (length === 0) throw new AnnouncementError("Message vide.");
  if (length > ANNOUNCEMENT_MAX_LENGTH) {
    throw new AnnouncementError(
      `Message trop long : ${length} caractères, ${ANNOUNCEMENT_MAX_LENGTH} au plus.`,
    );
  }
  return message;
}

type Executor = Pick<PostgresJsDatabase<Record<string, unknown>>, "execute">;

/** Destinataires : tous les comptes non supprimés, dont ceux qui ont un appareil abonné au push. */
export type AnnouncementReach = { accounts: number; pushSubscribers: number };

export async function announcementReach(db: Executor): Promise<AnnouncementReach> {
  const [row] = await db.execute<{ accounts: number; push_subscribers: number }>(sql`
    select count(*)::int as accounts,
      (count(*) filter (
        where exists (select 1 from push_subscriptions p where p.user_id = u.id)
      ))::int as push_subscribers
    from users u
    where u.deleted_at is null
  `);
  return { accounts: row?.accounts ?? 0, pushSubscribers: row?.push_subscribers ?? 0 };
}

/**
 * Écrit l'annonce dans la transaction donnée et signale `notification.new` à
 * chaque destinataire (reçu à la validation seulement). Le niveau de
 * notifications par ligue ne s'applique pas : une annonce de service passe toujours.
 */
export async function writeAnnouncement(tx: Executor, input: unknown): Promise<string[]> {
  const message = announcementMessage(input);
  const payload: NotificationPayload = { type: "announcement", message };
  const rows = await tx.execute<{ id: string; user_id: string }>(sql`
    insert into notifications (user_id, league_id, type, payload)
    select id, null, 'announcement', ${JSON.stringify(payload)}::jsonb
    from users
    where deleted_at is null
    returning id, user_id
  `);
  for (const row of rows) {
    await notify(tx, { type: "notification.new", id: row.id, user: row.user_id });
  }
  return rows.map((r) => r.id);
}

/** Envoie l'annonce, en une transaction, et dit à qui elle est partie. */
export async function sendAnnouncement(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: unknown,
): Promise<AnnouncementReach> {
  return db.transaction(async (tx) => {
    await writeAnnouncement(tx, input);
    return announcementReach(tx);
  });
}
