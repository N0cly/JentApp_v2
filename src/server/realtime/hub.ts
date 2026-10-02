import postgres from "postgres";
import { CHANNEL, type Envelope } from "./notify";

// Une seule connexion LISTEN par processus, hors du pool, rangée sur
// globalThis pour survivre au rechargement en dev. Le concentrateur
// redistribue les signaux aux flux ouverts de la ligue.

export type ServerEvent =
  | Envelope
  | { type: "presence"; league: string; online: string[] }
  | { type: "typing"; league: string; user: string; username: string }
  | { type: "resync" };

export type Subscriber = {
  userId: string;
  leagueId: string;
  openedAt: number;
  send: (event: ServerEvent) => void;
  close: () => void;
};

type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  listening: Promise<void> | null;
  client: ReturnType<typeof postgres> | null;
  connectedOnce: boolean;
};

const globalForHub = globalThis as unknown as { jentappHub?: Hub };

function hub(): Hub {
  globalForHub.jentappHub ??= {
    subscribers: new Map(),
    listening: null,
    client: null,
    connectedOnce: false,
  };
  return globalForHub.jentappHub;
}

/** Abonnés d'une ligue (copie, pour itérer sans risque). */
export function subscribersOf(leagueId: string): Subscriber[] {
  return [...(hub().subscribers.get(leagueId) ?? [])];
}

export function allSubscribers(): Subscriber[] {
  return [...hub().subscribers.values()].flatMap((set) => [...set]);
}

/** Redistribue un signal : à toute la ligue, ou au seul joueur concerné. */
export function dispatch(envelope: Envelope) {
  for (const sub of subscribersOf(envelope.league)) {
    if (envelope.user && envelope.type === "balance.changed" && sub.userId !== envelope.user)
      continue;
    sub.send(envelope);
  }
}

export function addSubscriber(sub: Subscriber) {
  const h = hub();
  const set = h.subscribers.get(sub.leagueId) ?? new Set();
  set.add(sub);
  h.subscribers.set(sub.leagueId, set);
}

export function removeSubscriber(sub: Subscriber) {
  const set = hub().subscribers.get(sub.leagueId);
  set?.delete(sub);
  if (set && set.size === 0) hub().subscribers.delete(sub.leagueId);
}

/**
 * Démarre l'écoute une fois. postgres.js rétablit la connexion seul ; à
 * chaque reprise (pas à la première), tous les flux reçoivent `resync`.
 */
export function ensureListening(url = process.env.DATABASE_URL): Promise<void> {
  const h = hub();
  if (h.listening) return h.listening;
  if (!url) throw new Error("DATABASE_URL manquante");
  h.client = postgres(url, { max: 1, onnotice: () => {} });
  h.listening = h.client
    .listen(
      CHANNEL,
      (payload) => {
        try {
          dispatch(JSON.parse(payload) as Envelope);
        } catch {
          // Signal illisible : ignoré.
        }
      },
      () => {
        if (h.connectedOnce) for (const sub of allSubscribers()) sub.send({ type: "resync" });
        h.connectedOnce = true;
      },
    )
    .then(() => undefined)
    .catch((error) => {
      h.listening = null;
      throw error;
    });
  return h.listening;
}

/** Pour les tests : ferme l'écoute et oublie les abonnés. */
export async function stopListening() {
  const h = hub();
  await h.client?.end({ timeout: 1 });
  h.client = null;
  h.listening = null;
  h.connectedOnce = false;
  h.subscribers.clear();
}
