import { sql } from "drizzle-orm";

// Signaux, pas des données (docs/M4.md, § Temps réel) : un type et un
// identifiant ; le client relit par le chemin normal.

export const CHANNEL = "jentapp_events";

export type EventType =
  | "message.new"
  | "message.deleted"
  | "reaction.changed"
  | "bet.changed"
  | "balance.changed"
  | "member.changed"
  /** Nouvelle notification : à tous les flux du joueur, quelle que soit la ligue. */
  | "notification.new";

export type Envelope = {
  /** Absente pour une annonce, qui ne tient à aucune ligue. */
  league?: string;
  type: EventType;
  id?: string | number;
  /** Destinataire unique (balance.changed, notification.new). */
  user?: string;
  /**
   * notification.new : push même si l'app du joueur est ouverte. Réservé à
   * l'aperçu des nouveautés sur la validation (docs/NOUVEAUTES.md, § Aperçu).
   */
  force?: boolean;
};

type Executor = { execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown> };

/** NOTIFY dans la transaction de l'écriture : envoyé à la validation, jamais après une annulation. */
export async function notify(tx: Executor, envelope: Envelope) {
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(envelope)})`);
}
