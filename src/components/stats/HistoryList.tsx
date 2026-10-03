"use client";

import { useState, useTransition } from "react";
import { historyAction } from "@/app/(app)/l/[ligue]/stats-actions";
import { Button } from "@/components/ui";
import type { HistoryItem } from "@/server/stats";
import { HistoryRow } from "./HistoryRow";

/** Historique de Moi : 20 lignes, puis « Voir plus ». */
export function HistoryList({
  leagueId,
  initial,
  initialHasMore,
}: {
  leagueId: string;
  initial: HistoryItem[];
  initialHasMore: boolean;
}) {
  const [extra, setExtra] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();

  // Le rendu serveur (direct compris) redonne la première page ; les suivantes s'y ajoutent.
  const seen = new Set(initial.map((i) => i.betId));
  const items = [...initial, ...extra.filter((i) => !seen.has(i.betId))];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-body text-center text-ink-muted">
          Aucun pari pour l&apos;instant. Lance-toi.
        </p>
        <Button href={`/l/${leagueId}/paris`} className="w-auto px-6">
          Voir les paris
        </Button>
      </div>
    );
  }

  const more = () =>
    startTransition(async () => {
      const next = await historyAction(leagueId, page + 1);
      setExtra((current) => [...current, ...next.items]);
      setPage(page + 1);
      setHasMore(next.hasMore);
    });

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <HistoryRow key={item.betId} item={item} href={`/l/${leagueId}/paris/${item.betId}`} />
      ))}
      {hasMore && (
        <Button variant="discreet" onClick={more} disabled={pending} className="self-center">
          Voir plus
        </Button>
      )}
    </div>
  );
}
