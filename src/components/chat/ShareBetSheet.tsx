"use client";

import { ListGroup, ListRow } from "@/components/List";
import { BottomSheet } from "@/components/ui";

export type Shareable = { id: string; label: string };

/** Choisir un pari à partager : les paris ouverts et programmés. */
export function ShareBetSheet({
  bets,
  onClose,
  onPick,
}: {
  bets: Shareable[];
  onClose: () => void;
  onPick: (betId: string) => void;
}) {
  return (
    <BottomSheet open onClose={onClose} title="Partager un pari">
      {bets.length === 0 ? (
        <p className="text-body text-ink-muted">Aucun pari ouvert à partager.</p>
      ) : (
        <ListGroup>
          {bets.map((bet) => (
            <ListRow key={bet.id} label={bet.label} mono={false} onClick={() => onPick(bet.id)} />
          ))}
        </ListGroup>
      )}
    </BottomSheet>
  );
}
