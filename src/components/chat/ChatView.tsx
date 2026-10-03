"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  deleteMessageAction,
  readMessageAction,
  readMessagesAction,
  sendAction,
  shareBetAction,
  toggleLikeAction,
  typingAction,
} from "@/app/(app)/l/[ligue]/chat-actions";
import { useLive, useLiveEvents } from "@/components/live/LiveProvider";
import {
  Avatar,
  Chip,
  FieldError,
  HeartIcon,
  IconButton,
  SendIcon,
  TicketIcon,
} from "@/components/ui";
import { cx } from "@/lib/cx";
import { clockTime, dayKey, dayLabel } from "@/lib/time-format";
import type { MessageView } from "@/server/chat";
import { ChatBetCard } from "./ChatBetCard";
import { GifSheet, type GifChoice } from "./GifSheet";
import { MessageBody } from "./MessageBody";
import { useProfileSheet } from "@/components/stats/ProfileSheet";
import { MessageSheet } from "./MessageSheet";
import { ShareBetSheet, type Shareable } from "./ShareBetSheet";

type Member = { id: string; username: string; image?: string | null; ring?: string | null };

type Props = {
  leagueId: string;
  me: Member;
  isManager: boolean;
  initial: MessageView[];
  members: Member[];
  gifsEnabled: boolean;
  shareable: Shareable[];
  /** Message à montrer (lien d'une notification de mention). */
  focusId?: number;
};

const PAGE = 50;
const TYPING_EVERY_MS = 3000;

function upsert(list: MessageView[], message: MessageView) {
  const others = list.filter((m) => m.id !== message.id);
  return [...others, message].sort((a, b) => a.id - b.id);
}

/** Pastille « j'aime » : affichée dès le premier ; un appui bascule le mien. */
function LikePill({ message, onToggle }: { message: MessageView; onToggle: () => void }) {
  if (message.likes === 0) return null;
  return (
    <div className="flex gap-1">
      <button
        type="button"
        aria-label={`${message.likes} j'aime`}
        aria-pressed={message.likedByMe}
        onClick={onToggle}
        className={cx(
          "flex min-h-[28px] items-center gap-1 rounded-full border px-2 font-mono text-[12px] font-medium",
          message.likedByMe
            ? "border-brand bg-brand-soft text-brand"
            : "border-line-strong bg-surface text-ink-muted",
        )}
      >
        <HeartIcon size={14} />
        {message.likes}
      </button>
    </div>
  );
}

function Bubble({
  message,
  mine,
  onOpen,
}: {
  message: MessageView;
  mine: boolean;
  onOpen: () => void;
}) {
  if (message.kind === "gif" && message.gif) {
    const width = Math.min(240, message.gif.width ?? 200);
    const height =
      message.gif.width && message.gif.height
        ? Math.round((width * message.gif.height) / message.gif.width)
        : width;
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="GIF"
        className="overflow-hidden rounded-md"
      >
        <Image src={message.gif.url} alt="" width={width} height={height} unoptimized />
      </button>
    );
  }
  if (!message.body) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "max-w-full px-4 py-2 text-left text-[15px] leading-[21px] [overflow-wrap:anywhere]",
        mine
          ? "rounded-tl-lg rounded-tr-sm rounded-b-lg bg-brand-soft"
          : "rounded-tl-sm rounded-tr-lg rounded-b-lg bg-surface",
      )}
    >
      <MessageBody body={message.body} mentions={message.mentions} />
    </button>
  );
}

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; message: MessageView }
  | {
      kind: "group";
      key: number;
      author: NonNullable<MessageView["author"]>;
      mine: boolean;
      messages: MessageView[];
    };

function layout(messages: MessageView[], me: string): Item[] {
  const items: Item[] = [];
  const now = new Date();
  let lastDay = "";
  for (const message of messages) {
    const day = dayKey(message.createdAt);
    if (day !== lastDay) {
      items.push({ kind: "day", key: day, label: dayLabel(message.createdAt, now) });
      lastDay = day;
    }
    if (message.kind === "system" || !message.author) {
      items.push({ kind: "system", message });
      continue;
    }
    const last = items.at(-1);
    if (last?.kind === "group" && last.author.id === message.author.id) last.messages.push(message);
    else
      items.push({
        kind: "group",
        key: message.id,
        author: message.author,
        mine: message.author.id === me,
        messages: [message],
      });
  }
  return items;
}

export function ChatView({
  leagueId,
  me,
  isManager,
  initial,
  members,
  gifsEnabled,
  shareable,
  focusId,
}: Props) {
  const live = useLive();
  const [messages, setMessages] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === PAGE);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"gif" | "share" | null>(null);
  const [selected, setSelected] = useState<MessageView | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  // Auteur d'un message : son profil ; parti ou supprimé, rien.
  const profile = useProfileSheet(leagueId);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const stickNext = useRef(true);
  const lastTyping = useRef(0);
  const loadingOlder = useRef(false);

  const scrollToBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNewBelow(false);
  }, []);

  // Collé en bas quand on y est déjà ; immobile quand on lit plus haut.
  useLayoutEffect(() => {
    if (stickNext.current) scrollToBottom();
    stickNext.current = false;
  }, [messages, scrollToBottom]);

  // Arrivée par une mention : le message au milieu de l'écran, s'il est chargé.
  useLayoutEffect(() => {
    if (focusId === undefined) return;
    document.getElementById(`message-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const refreshOne = useCallback(
    async (id: number, fromSomeoneElse: boolean) => {
      const message = await readMessageAction(leagueId, id);
      if (!message) {
        setMessages((list) => list.filter((m) => m.id !== id));
        return;
      }
      setMessages((list) => {
        const isNew = !list.some((m) => m.id === id);
        if (isNew) {
          if (atBottom.current || message.author?.id === me.id) stickNext.current = true;
          else if (fromSomeoneElse) setNewBelow(true);
        }
        return upsert(list, message);
      });
    },
    [leagueId, me.id],
  );

  // Un pari change : ses cartes dans le fil se relisent.
  useLiveEvents(["bet.changed"], (event) => {
    if (event.type !== "bet.changed") return;
    for (const m of messages) if (m.bet && m.betId === event.id) void refreshOne(m.id, false);
  });

  useLiveEvents(["message.new", "message.deleted", "reaction.changed"], (event) => {
    if (event.type === "resync") {
      // Reconnexion : on relit les 50 derniers.
      void readMessagesAction(leagueId).then((latest) => {
        stickNext.current = atBottom.current;
        setMessages(latest);
        setHasMore(latest.length === PAGE);
      });
      return;
    }
    const id = Number(event.id);
    if (event.type === "message.deleted") setMessages((list) => list.filter((m) => m.id !== id));
    else void refreshOne(id, event.type === "message.new");
  });

  async function loadOlder() {
    const el = scroller.current;
    if (!el || loadingOlder.current || !hasMore || messages.length === 0) return;
    loadingOlder.current = true;
    const before = el.scrollHeight;
    const older = await readMessagesAction(leagueId, messages[0]!.id);
    setHasMore(older.length === PAGE);
    setMessages((list) => [...older.filter((o) => !list.some((m) => m.id === o.id)), ...list]);
    requestAnimationFrame(() => {
      el.scrollTop += el.scrollHeight - before;
      loadingOlder.current = false;
    });
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom.current) setNewBelow(false);
    if (el.scrollTop < 40) void loadOlder();
  }

  async function sent(result: { id?: number; error?: string }) {
    if (result.error) {
      setError(result.error);
      return false;
    }
    setError(null);
    if (result.id) await refreshOne(result.id, false);
    return true;
  }

  async function send() {
    const body = text;
    if (!body.trim()) return;
    if (await sent(await sendAction(leagueId, { kind: "text", body }))) setText("");
  }

  function onType(value: string) {
    setText(value);
    setError(null);
    if (value && Date.now() - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = Date.now();
      void typingAction(leagueId);
    }
  }

  // Suggestion de mention : après « @ », les membres qui correspondent.
  const mentionQuery = /(?:^|\s)@([\p{L}\p{M}\p{N}_-]*)$/u.exec(text)?.[1];
  const suggestions =
    mentionQuery === undefined
      ? []
      : members
          .filter(
            (m) =>
              m.id !== me.id && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 5);

  const items = layout(messages, me.id);
  const typing = live.typing.filter((t) => t.user !== me.id).map((t) => t.username);

  let content: ReactNode;
  if (messages.length === 0) {
    content = (
      <div className="flex grow items-center justify-center">
        <p className="text-body text-center text-ink-muted">Personne n&apos;a encore rien dit.</p>
      </div>
    );
  } else {
    content = items.map((item) => {
      if (item.kind === "day") {
        return (
          <h2 key={`day-${item.key}`} className="text-overline self-center text-ink-subtle">
            {item.label}
          </h2>
        );
      }
      if (item.kind === "system") {
        const m = item.message;
        const line = (
          <span className="flex items-center gap-1 text-center font-mono text-[12px] leading-4 font-medium text-ink-subtle">
            <TicketIcon size={14} />
            {m.text}
          </span>
        );
        return (
          <div key={m.id} className="flex flex-col items-center gap-2">
            {m.betId ? (
              <Link href={`/l/${leagueId}/paris/${m.betId}`} className="relative">
                {/* Ligne de 16 px ; l'appui, 44 px. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 h-[44px] -translate-y-1/2"
                />
                {line}
              </Link>
            ) : (
              line
            )}
            {m.bet && <ChatBetCard leagueId={leagueId} bet={m.bet} />}
          </div>
        );
      }
      const first = item.messages[0]!;
      const last = item.messages.at(-1)!;
      const bubbles = item.messages.map((m) => (
        <div
          key={m.id}
          id={`message-${m.id}`}
          className={cx("flex flex-col gap-1", item.mine && "items-end")}
        >
          <Bubble message={m} mine={item.mine} onOpen={() => setSelected(m)} />
          {m.bet && <ChatBetCard leagueId={leagueId} bet={m.bet} />}
          <LikePill
            message={m}
            onToggle={() =>
              void toggleLikeAction(leagueId, m.id).then(() => refreshOne(m.id, false))
            }
          />
        </div>
      ));
      if (item.mine) {
        return (
          <div
            key={item.key}
            className="flex max-w-[270px] min-w-0 flex-col items-end gap-1 self-end"
          >
            {bubbles}
            <span className="font-mono text-[12px] leading-4 font-medium text-ink-subtle">
              {clockTime(last.createdAt)}
            </span>
          </div>
        );
      }
      return (
        <div key={item.key} className="flex items-start gap-2">
          <button
            type="button"
            aria-label={`Profil de ${item.author.username}`}
            onClick={() => profile.open(item.author.id)}
            className="relative shrink-0 rounded-full"
          >
            {/* L'avatar fait 32 px ; l'appui, 44 px. */}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-[44px] -translate-1/2"
            />
            <Avatar
              name={item.author.username}
              src={item.author.image}
              ring={item.author.ring ?? undefined}
              size={32}
              background="surface-raised"
            />
          </button>
          <div className="flex max-w-[270px] min-w-0 flex-col gap-1">
            <span className="flex text-[12px] leading-4 font-semibold text-ink-muted">
              <span className="truncate">{item.author.username}</span>
              <span className="shrink-0 font-mono font-medium whitespace-pre text-ink-subtle">
                {" "}
                {clockTime(first.createdAt)}
              </span>
            </span>
            {bubbles}
          </div>
        </div>
      );
    });
  }

  return (
    <>
      <div className="relative flex min-h-0 grow flex-col">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-5 pb-2"
        >
          <div className="grow" />
          {content}
          {typing.length > 0 && (
            <span className="text-caption text-ink-subtle italic">
              {typing.length === 1 ? `${typing[0]} écrit…` : `${typing.join(" et ")} écrivent…`}
            </span>
          )}
        </div>
        {newBelow && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            <Chip selected onClick={scrollToBottom}>
              Nouveaux messages
            </Chip>
          </div>
        )}
      </div>

      {(error || live.status === "lost") && (
        <div className="px-5 pb-2">
          <FieldError id="chat-error">{error ?? "Connexion perdue. On réessaie…"}</FieldError>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mx-3 mb-2 flex flex-col rounded-md bg-surface-raised">
          {suggestions.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setText((t) => t.replace(/@([\p{L}\p{M}\p{N}_-]*)$/u, `@${m.username} `))
              }
              className="flex min-h-[44px] items-center gap-2 px-4 text-left text-[15px] font-semibold"
            >
              <Avatar name={m.username} src={m.image} ring={m.ring ?? undefined} size={32} />
              {m.username}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex shrink-0 items-center gap-2 border-t border-line px-3 pt-2 pb-3"
      >
        {gifsEnabled && (
          <IconButton label="Envoyer un GIF" variant="outlined" onClick={() => setSheet("gif")}>
            <span className="font-mono text-[12px] font-medium">GIF</span>
          </IconButton>
        )}
        <IconButton label="Partager un pari" variant="outlined" onClick={() => setSheet("share")}>
          <TicketIcon size={20} />
        </IconButton>
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <input
          id="message"
          autoComplete="off"
          placeholder="Message"
          value={text}
          onChange={(e) => onType(e.target.value)}
          className="h-[44px] min-w-0 grow rounded-full border border-line-strong bg-surface px-4 text-[15px] text-ink"
        />
        <IconButton label="Envoyer" variant="brand" type="submit" disabled={!text.trim()}>
          <SendIcon size={20} />
        </IconButton>
      </form>

      {sheet === "gif" && (
        <GifSheet
          onClose={() => setSheet(null)}
          onPick={async (gif: GifChoice) => {
            setSheet(null);
            await sent(
              await sendAction(leagueId, {
                kind: "gif",
                gifUrl: gif.url,
                width: gif.width,
                height: gif.height,
              }),
            );
          }}
        />
      )}
      {sheet === "share" && (
        <ShareBetSheet
          bets={shareable}
          onClose={() => setSheet(null)}
          onPick={async (betId) => {
            setSheet(null);
            await sent(await shareBetAction(leagueId, betId, ""));
          }}
        />
      )}
      {profile.sheet}
      {selected && (
        <MessageSheet
          liked={selected.likedByMe}
          canDelete={selected.author?.id === me.id || isManager}
          onClose={() => setSelected(null)}
          onLike={async () => {
            const id = selected.id;
            setSelected(null);
            await toggleLikeAction(leagueId, id);
            await refreshOne(id, false);
          }}
          onDelete={async () => {
            const id = selected.id;
            setSelected(null);
            await deleteMessageAction(leagueId, id);
            setMessages((list) => list.filter((m) => m.id !== id));
          }}
        />
      )}
    </>
  );
}
