"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Flux de la ligue : des signaux, que chaque écran relit par le chemin normal
// (docs/M4.md, § Temps réel). Ouvert dans le layout de la ligue, fermé quand
// l'onglet passe en arrière-plan, rouvert au retour ; chaque ouverture émet
// « resync » pour que tout soit relu.

export type LiveEvent = {
  type: string;
  id?: string | number;
  user?: string;
  username?: string;
  online?: string[];
};

type Listener = (event: LiveEvent) => void;
type Status = "connecting" | "open" | "lost";

type Live = {
  status: Status;
  online: string[];
  typing: { user: string; username: string }[];
  subscribe: (listener: Listener) => () => void;
};

const LiveContext = createContext<Live | null>(null);

const TYPING_SHOWN_MS = 4000;
const EVENTS = [
  "message.new",
  "message.deleted",
  "reaction.changed",
  "bet.changed",
  "balance.changed",
  "member.changed",
  "notification.new",
  "presence",
  "typing",
  "resync",
];

export function LiveProvider({ leagueId, children }: { leagueId: string; children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [status, setStatus] = useState<Status>("connecting");
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<{ user: string; username: string; until: number }[]>([]);

  const emit = useCallback((event: LiveEvent) => {
    for (const listener of listeners.current) listener(event);
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (source) return;
      setStatus("connecting");
      source = new EventSource(`/api/stream?ligue=${leagueId}`);
      source.onopen = () => {
        setStatus("open");
        emit({ type: "resync" });
      };
      source.onerror = () => {
        setStatus("lost");
        // Fermé par le serveur (404, session perdue) : le navigateur ne réessaie pas seul.
        if (source?.readyState === EventSource.CLOSED) {
          source = null;
          retry = setTimeout(open, 3000);
        }
      };
      for (const type of EVENTS) {
        source.addEventListener(type, (message) => {
          const event = JSON.parse((message as MessageEvent<string>).data) as LiveEvent;
          if (event.type === "presence") setOnline(event.online ?? []);
          if (event.type === "typing" && event.user) {
            const entry = {
              user: event.user,
              username: event.username ?? "",
              until: Date.now() + TYPING_SHOWN_MS,
            };
            setTyping((list) => [...list.filter((t) => t.user !== entry.user), entry]);
          }
          if (event.type === "message.new" && event.user) {
            setTyping((list) => list.filter((t) => t.user !== event.user));
          }
          emit(event);
        });
      }
    };

    const close = () => {
      clearTimeout(retry);
      source?.close();
      source = null;
    };

    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());
    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [leagueId, emit]);

  // « écrit… » s'efface après 4 secondes.
  useEffect(() => {
    if (typing.length === 0) return;
    const next = Math.min(...typing.map((t) => t.until)) - Date.now();
    const timer = setTimeout(
      () => setTyping((list) => list.filter((t) => t.until > Date.now())),
      Math.max(0, next),
    );
    return () => clearTimeout(timer);
  }, [typing]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return (
    <LiveContext.Provider
      value={{
        status,
        online,
        typing: typing.map(({ user, username }) => ({ user, username })),
        subscribe,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error("useLive hors de LiveProvider");
  return live;
}

/** Écoute des signaux choisis (et « resync », qui demande de tout relire). */
export function useLiveEvents(types: string[], handler: Listener) {
  const { subscribe } = useLive();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const key = types.join(",");
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "resync" || key.split(",").includes(event.type)) latest.current(event);
      }),
    [subscribe, key],
  );
}
