"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { moreJournalAction } from "@/app/(app)/l/[ligue]/reglages/journal/actions";
import { Button } from "@/components/ui";
import { clockTime, dayKey, dayLabel } from "@/lib/time-format";
import type { JournalEntry } from "@/server/journal";

const subscribe = () => () => {};

/** Journal de la ligue par jour (journal.html), heures du téléphone. */
export function JournalList({
  leagueId,
  initial,
  initialHasMore,
}: {
  leagueId: string;
  initial: JournalEntry[];
  initialHasMore: boolean;
}) {
  const [extra, setExtra] = useState<JournalEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();
  // Le fuseau n'existe que dans le navigateur : rien au rendu serveur.
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const seen = new Set(initial.map((e) => e.id));
  const items = [...initial, ...extra.filter((e) => !seen.has(e.id))];

  if (items.length === 0) {
    return (
      <div className="flex grow items-center justify-center pb-8">
        <p className="text-body text-center text-ink-muted">Rien au journal pour l&apos;instant.</p>
      </div>
    );
  }
  if (!ready) return null;

  const now = new Date();
  const days: { key: string; label: string; entries: JournalEntry[] }[] = [];
  for (const entry of items) {
    const key = dayKey(entry.createdAt);
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, label: dayLabel(entry.createdAt, now), entries: [entry] });
  }

  const more = () =>
    startTransition(async () => {
      const next = await moreJournalAction(leagueId, page + 1);
      setExtra((current) => [...current, ...next.items]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    });

  return (
    <>
      {days.map((day) => (
        <section key={day.key} className="flex flex-col gap-2">
          <h2 className="text-overline text-ink-subtle">{day.label}</h2>
          <div className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
            {day.entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 py-3">
                <span className="w-[44px] shrink-0 font-mono text-[13px] leading-5 font-medium text-ink-subtle">
                  {clockTime(entry.createdAt)}
                </span>
                <span className="text-[14px] leading-5">
                  {entry.actor && <span className="font-bold">{entry.actor}</span>}
                  {entry.actor ? ` ${entry.text}` : entry.text}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <Button variant="discreet" onClick={more} disabled={pending} className="self-center">
          Voir plus
        </Button>
      )}
    </>
  );
}
