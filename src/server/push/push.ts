// Push web (docs/M7.md, § Push) : abonnements par appareil, envoi après la
// validation de l'événement, jamais à un joueur qui a l'app ouverte.

import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/db/client";
import { leagues, notifications, pushSubscriptions } from "@/db/schema";
import {
  notificationHref,
  notificationTag,
  notificationText,
  type NotificationPayload,
} from "@/lib/notification-text";
import { NotFoundError } from "@/server/errors";
import { ensureListening, hasOpenStream, onEnvelope } from "@/server/realtime/hub";
import { vapidKeys } from "./config";

/** Le push s'écrit à l'heure de Paris : le serveur ne connaît pas le fuseau du téléphone. */
export const PUSH_TIME_ZONE = "Europe/Paris";

/** Types qui partent en push (« Pari réglé » va seulement au centre). */
const PUSHED = new Set<NotificationPayload["type"]>([
  "bet_opened",
  "bet_resolved",
  "bet_cancelled",
  "mention",
  "round",
  "announcement",
  "release",
]);

export type BrowserSubscription = {
  endpoint: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function parseSubscription(input: BrowserSubscription) {
  const { endpoint } = input;
  const p256dh = input.keys?.p256dh;
  const auth = input.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    throw new NotFoundError();
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new NotFoundError();
  }
  if (url.protocol !== "https:" || endpoint.length > 2048) throw new NotFoundError();
  return { endpoint, p256dh, auth };
}

/** Abonne cet appareil ; un endpoint déjà connu passe au joueur qui s'abonne. */
export async function subscribe(actor: { id: string }, input: BrowserSubscription): Promise<void> {
  const sub = parseSubscription(input);
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId: actor.id, ...sub })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: actor.id, p256dh: sub.p256dh, auth: sub.auth },
    });
}

/** Désabonne cet appareil (interrupteur coupé, déconnexion). */
export async function unsubscribe(actor: { id: string }, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== "string") return;
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.id)));
}

/** Cet appareil est-il abonné pour ce joueur ? */
export async function isSubscribed(actor: { id: string }, endpoint: unknown): Promise<boolean> {
  if (typeof endpoint !== "string") return false;
  const [row] = await getDb()
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.id)));
  return row !== undefined;
}

export type PushMessage = { title: string; body: string; url: string; tag: string | null };

/** Ce qui part au service de push, pour un appareil. */
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  message: PushMessage,
) => Promise<void>;

/** Envoi réel, par web-push et les clés VAPID. */
export const webPushSender: PushSender = async (subscription, message) => {
  const keys = vapidKeys();
  if (!keys) return;
  await webpush.sendNotification(subscription, JSON.stringify(message), {
    vapidDetails: keys,
    TTL: 24 * 3600,
    urgency: "high",
    timeout: 10_000,
  });
};

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

/**
 * Envoie le push d'une notification validée. Rien pour « Pari réglé », rien
 * à un joueur qui a un flux ouvert, sauf `force` (aperçu des nouveautés). Un abonnement mort (404, 410) est
 * supprimé ; un autre échec se journalise et n'annule rien.
 */
export async function pushNotification(
  notificationId: string,
  send: PushSender = webPushSender,
  now = new Date(),
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  const [row] = await getDb()
    .select({
      userId: notifications.userId,
      leagueId: notifications.leagueId,
      leagueName: leagues.name,
      payload: notifications.payload,
    })
    .from(notifications)
    .leftJoin(leagues, eq(leagues.id, notifications.leagueId))
    .where(eq(notifications.id, notificationId));
  if (!row) return 0;
  const payload = row.payload as NotificationPayload;
  if (!PUSHED.has(payload.type)) return 0;
  if (!force && hasOpenStream(row.userId)) return 0;

  const subs = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, row.userId));
  const message: PushMessage = {
    // Une annonce, sans ligue, porte le nom de l'app.
    title: row.leagueName ?? "JentApp",
    body: notificationText(payload, now, PUSH_TIME_ZONE),
    url: notificationHref(row.leagueId, payload),
    tag: notificationTag(payload),
  };
  let sent = 0;
  for (const sub of subs) {
    try {
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message);
      sent += 1;
    } catch (error) {
      const status = statusOf(error);
      if (status === 404 || status === 410) {
        await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.warn(`Push en échec (${status ?? "réseau"}) pour l'abonnement ${sub.id}`);
      }
    }
  }
  return sent;
}

/**
 * Branche l'envoi sur les signaux `notification.new`, reçus par LISTEN donc
 * après la validation. Une fois par processus, au démarrage du serveur.
 */
export async function startPush(send: PushSender = webPushSender): Promise<() => void> {
  await ensureListening();
  return onEnvelope((envelope) => {
    if (envelope.type !== "notification.new" || typeof envelope.id !== "string") return;
    if (send === webPushSender && !vapidKeys()) return;
    const force = envelope.force === true;
    void pushNotification(envelope.id, send, new Date(), { force }).catch((error) =>
      console.warn("Push en échec", error),
    );
  });
}
