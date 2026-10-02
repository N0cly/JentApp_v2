"use client";

import { BottomSheet, Button } from "@/components/ui";

/** Actions sur un message : « J'aime » ou « Retirer mon j'aime », et « Supprimer » pour qui en a le droit. */
export function MessageSheet({
  liked,
  canDelete,
  onLike,
  onDelete,
  onClose,
}: {
  liked: boolean;
  canDelete: boolean;
  onLike: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open onClose={onClose} title="Message">
      <Button variant="secondary" onClick={onLike}>
        {liked ? "Retirer mon j'aime" : "J'aime"}
      </Button>
      {canDelete && (
        <Button variant="discreet" destructive onClick={onDelete}>
          Supprimer
        </Button>
      )}
    </BottomSheet>
  );
}
