import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import {
  addSubscriber,
  ensureListening,
  removeSubscriber,
  subscribersOf,
  type ServerEvent,
  type Subscriber,
} from "./hub";

export const MAX_STREAMS = 3;
const KEEPALIVE_MS = 25_000;

export const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

type Hooks = {
  /** Appelé à l'ouverture et à la fermeture (présence). */
  onChange?: (leagueId: string) => void;
};

/**
 * Ouvre le flux d'un membre actif ; un non-membre reçoit une 404. Trois flux
 * au plus par joueur et par ligue : le plus ancien est fermé. Un membre qui
 * part ou est exclu voit ses flux fermés.
 */
export async function openStream(
  userId: string,
  leagueId: string,
  signal: AbortSignal,
  hooks: Hooks = {},
): Promise<{ stream: ReadableStream<Uint8Array>; subscriber: Subscriber }> {
  await memberOrNotFound(userId, leagueId);
  await ensureListening();

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const write = (text: string) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      close();
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    removeSubscriber(subscriber);
    try {
      controller.close();
    } catch {
      // Déjà fermé côté client.
    }
    hooks.onChange?.(leagueId);
  };

  const subscriber: Subscriber = {
    userId,
    leagueId,
    openedAt: Date.now(),
    send: (event: ServerEvent) => {
      if (event.type === "member.changed") {
        // Départ ou exclusion : on revérifie l'appartenance de ce flux.
        memberOrNotFound(userId, leagueId).catch((error) => {
          if (error instanceof NotFoundError) close();
        });
      }
      write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    close,
  };

  // Un commentaire toutes les 25 secondes garde la connexion ouverte.
  const keepalive = setInterval(() => write(": ping\n\n"), KEEPALIVE_MS);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      write(": ouvert\n\n");
    },
    cancel() {
      close();
    },
  });

  const mine = subscribersOf(leagueId)
    .filter((s) => s.userId === userId)
    .sort((a, b) => a.openedAt - b.openedAt);
  for (const old of mine.slice(0, Math.max(0, mine.length - (MAX_STREAMS - 1)))) old.close();

  addSubscriber(subscriber);
  signal.addEventListener("abort", close, { once: true });
  hooks.onChange?.(leagueId);
  return { stream, subscriber };
}
