"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import {
  markAllReadAction,
  moreNotificationsAction,
  openNotificationAction,
} from "@/app/(app)/notifications/actions";
import {
  AtIcon,
  Button,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  GiftIcon,
  TicketIcon,
} from "@/components/ui";
import { cx } from "@/lib/cx";
import { notificationText, type NotificationType } from "@/lib/notification-text";
import { shortWhen } from "@/lib/time-format";
import type { NotificationView } from "@/server/notifications";

const icons: Record<NotificationType, (props: { size: number }) => ReactNode> = {
  mention: AtIcon,
  bet_resolved: ClockIcon,
  bet_opened: TicketIcon,
  round: GiftIcon,
  bet_settled: CheckIcon,
  bet_cancelled: CloseIcon,
};

const subscribe = () => () => {};

/** Phrase et heure, écrites dans le fuseau du téléphone : rien au rendu serveur. */
function useClientText(item: NotificationView): { text: string; when: string } | null {
  // Une chaîne, pour que React compare l'instantané par valeur.
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const now = new Date();
      return `${notificationText(item.payload, now)}\n${shortWhen(item.createdAt, now)}`;
    },
    () => null,
  );
  if (snapshot === null) return null;
  const [text, when] = snapshot.split("\n");
  return { text: text!, when: when! };
}

function Row({ item, onOpen }: { item: NotificationView; onOpen: () => void }) {
  const shown = useClientText(item);
  const Icon = icons[item.payload.type];
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 py-3 text-left">
      <span
        className={cx(
          "flex size-[36px] shrink-0 items-center justify-center rounded-full bg-surface-raised",
          item.read ? "text-ink-muted" : "text-brand",
        )}
      >
        <Icon size={18} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-1">
        <span className="text-[14px] leading-5 font-semibold [overflow-wrap:anywhere]">
          {shown?.text ?? " "}
        </span>
        {/* Le nom de la ligue se coupe ; l'heure reste lisible. */}
        <span className="flex font-mono text-[12px] leading-4 font-medium text-ink-subtle">
          {shown ? (
            <>
              <span className="truncate">{item.leagueName.toUpperCase()}</span>
              <span className="shrink-0 whitespace-pre"> · {shown.when}</span>
            </>
          ) : (
            " "
          )}
        </span>
      </span>
      {!item.read && (
        <span aria-label="Non lue" className="mt-2 size-[8px] shrink-0 rounded-full bg-loss" />
      )}
    </button>
  );
}

/** Centre de notifications (notifications.html). */
export function NotificationList({
  initial,
  initialHasMore,
}: {
  initial: NotificationView[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const [extra, setExtra] = useState<NotificationView[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();
  const seen = new Set(initial.map((i) => i.id));
  const items = [...initial, ...extra.filter((i) => !seen.has(i.id))];

  const open = (item: NotificationView) =>
    startTransition(async () => {
      router.push(await openNotificationAction(item.id));
    });

  const more = () =>
    startTransition(async () => {
      const next = await moreNotificationsAction(page + 1);
      setExtra((current) => [...current, ...next.items]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    });

  if (items.length === 0) {
    return (
      <div className="flex grow items-center justify-center pb-8">
        <p className="text-body text-center text-ink-muted">Rien de neuf.</p>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
        {items.map((item) => (
          <Row key={item.id} item={item} onOpen={() => open(item)} />
        ))}
      </div>
      {hasMore && (
        <Button variant="discreet" onClick={more} disabled={pending} className="self-center">
          Voir plus
        </Button>
      )}
      <p className="text-caption text-ink-subtle">
        Une notification ouvre la bonne ligue, sur le bon pari ou le bon message.
      </p>
    </>
  );
}

/** « Tout lire », en haut à droite. */
export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllReadAction();
          router.refresh();
        })
      }
      className="min-h-[44px] px-2 text-[14px] leading-5 font-semibold text-brand"
    >
      Tout lire
    </button>
  );
}
