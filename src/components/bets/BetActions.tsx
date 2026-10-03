"use client";

import { useState, useTransition } from "react";
import { cancelBetAction } from "@/app/(app)/l/[ligue]/paris/actions";
import { BottomSheet, Button } from "@/components/ui";

/** « Modifier le pari » et « Annuler le pari », discrets, pour qui en a le droit. */
export function BetActions({
  leagueId,
  betId,
  canEdit,
  canCancel,
}: {
  leagueId: string;
  betId: string;
  canEdit: boolean;
  canCancel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!canEdit && !canCancel) return null;
  return (
    <div className="flex flex-col">
      {canEdit && (
        <Button variant="discreet" href={`/l/${leagueId}/paris/${betId}/modifier`}>
          Modifier le pari
        </Button>
      )}
      {canCancel && (
        <Button variant="discreet" destructive onClick={() => setOpen(true)}>
          Annuler le pari
        </Button>
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Annuler le pari">
        <p className="text-body text-ink-muted">Annuler ce pari ? Toutes les mises sont rendues.</p>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await cancelBetAction(leagueId, betId);
              setOpen(false);
            })
          }
        >
          Annuler le pari
        </Button>
      </BottomSheet>
    </div>
  );
}
