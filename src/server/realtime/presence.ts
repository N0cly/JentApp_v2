import { subscribersOf } from "./hub";

// Présence et « écrit… » : en mémoire dans le processus, jamais en base.

/** Joueurs en ligne : au moins un flux ouvert sur la ligue (deux onglets comptent pour un). */
export function onlineIn(leagueId: string): string[] {
  return [...new Set(subscribersOf(leagueId).map((s) => s.userId))].sort();
}

export function broadcastPresence(leagueId: string) {
  const online = onlineIn(leagueId);
  for (const sub of subscribersOf(leagueId))
    sub.send({ type: "presence", league: leagueId, online });
}

const TYPING_EVERY_MS = 3000;
const globalForTyping = globalThis as unknown as { jentappTyping?: Map<string, number> };

/** « {pseudo} écrit… » à toute la ligue sauf l'auteur, au plus une fois toutes les 3 secondes. */
export function broadcastTyping(
  leagueId: string,
  userId: string,
  username: string,
  now = Date.now(),
) {
  globalForTyping.jentappTyping ??= new Map();
  const key = `${leagueId}:${userId}`;
  const last = globalForTyping.jentappTyping.get(key) ?? 0;
  if (now - last < TYPING_EVERY_MS) return false;
  globalForTyping.jentappTyping.set(key, now);
  for (const sub of subscribersOf(leagueId)) {
    if (sub.userId !== userId)
      sub.send({ type: "typing", league: leagueId, user: userId, username });
  }
  return true;
}
