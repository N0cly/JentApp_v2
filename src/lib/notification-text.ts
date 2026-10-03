// Phrase et lien d'une notification (docs/M7.md, § Notifications), écrits à
// la lecture à partir du payload. Partagé : le centre l'écrit à l'heure du
// téléphone, le push à l'heure de Paris.

import { frenchSpacing } from "./typo";
import { atTime } from "./time-format";

export type NotificationPayload =
  | {
      type: "bet_opened";
      betId: string;
      /** Absente pour un pari mystère : ni question ni options ne sont écrites. */
      question: string | null;
      /** Ouverture d'un pari programmé, en ISO ; vide s'il est déjà ouvert. */
      opensAt: string | null;
    }
  | {
      type: "bet_resolved";
      betId: string;
      question: string;
      option: string;
      delayMinutes: number;
      correction: boolean;
    }
  | {
      type: "bet_settled";
      betId: string;
      question: string;
      outcome: "won" | "lost" | "refunded";
      amount: number;
    }
  | { type: "bet_cancelled"; betId: string; question: string; amount: number }
  | { type: "mention"; messageId: number; author: string }
  | { type: "round"; amount: number };

export type NotificationType = NotificationPayload["type"];

const clopes = (n: number) => `${n} ${n > 1 ? "clopes" : "clope"}`;
const minutes = (n: number) => `${n} ${n > 1 ? "minutes" : "minute"}`;
const quoted = (question: string) => `« ${frenchSpacing(question)} »`;

/** La phrase de la notification. `timeZone` vide : celui de l'appareil. */
export function notificationText(
  payload: NotificationPayload,
  now: Date,
  timeZone?: string,
): string {
  switch (payload.type) {
    case "bet_opened": {
      if (!payload.opensAt) return `Nouveau pari : ${frenchSpacing(payload.question ?? "")}`;
      const when = atTime(new Date(payload.opensAt), now, timeZone);
      return payload.question === null
        ? `Pari mystère programmé. Ouverture ${when}.`
        : `Pari programmé, ouverture ${when} : ${frenchSpacing(payload.question)}`;
    }
    case "bet_resolved":
      return `${payload.correction ? "Résultat corrigé" : "Résultat saisi"} sur ${quoted(payload.question)} : ${payload.option}. Versement dans ${minutes(payload.delayMinutes)}.`;
    case "bet_settled":
      if (payload.outcome === "won")
        return `Pari réglé : tu gagnes ${clopes(payload.amount)} sur ${quoted(payload.question)}`;
      if (payload.outcome === "lost")
        return `Pari réglé : tu perds ${clopes(payload.amount)} sur ${quoted(payload.question)}`;
      return `Pari réglé : ta mise de ${payload.amount} est rendue sur ${quoted(payload.question)}`;
    case "bet_cancelled":
      return `Pari annulé : ${quoted(payload.question)}. Ta mise de ${payload.amount} est rendue.`;
    case "mention":
      return `${payload.author} t'a mentionné dans le chat`;
    case "round":
      return `Tournée générale : +${clopes(payload.amount)} pour tout le monde`;
  }
}

/** Où mène la notification : le pari, ou le chat sur le message. */
export function notificationHref(leagueId: string, payload: NotificationPayload): string {
  switch (payload.type) {
    case "mention":
      return `/l/${leagueId}/chat?message=${payload.messageId}`;
    case "round":
      return `/l/${leagueId}/paris`;
    default:
      return `/l/${leagueId}/paris/${payload.betId}`;
  }
}

/** Étiquette du push : une correction remplace la notification du même pari. */
export function notificationTag(payload: NotificationPayload): string | null {
  return "betId" in payload ? `bet:${payload.betId}` : null;
}
