"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markReleaseSeenAction } from "@/app/(app)/release-actions";
import { BottomSheet, Button } from "@/components/ui";
import { frenchSpacing } from "@/lib/typo";
import type { Release } from "@/server/releases";
import { ReleaseBody } from "./ReleaseBody";

/**
 * Feuille « Quoi de neuf » (docs/VALIDATION.md, B.5), à la première page
 * ouverte après une mise à jour. Fermée de n'importe quelle façon, la version
 * est notée comme lue : elle ne revient pas.
 */
export function WhatsNewSheet({ release }: { release: Release }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();

  const close = (then?: () => void) => {
    if (!open) return;
    setOpen(false);
    startTransition(async () => {
      await markReleaseSeenAction();
      then?.();
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => close()}
      overline={`NOUVEAUTÉS · ${release.version}`}
      title={frenchSpacing(release.title)}
    >
      <ReleaseBody release={release} />
      <Button onClick={() => close()} className="mt-3">
        Compris
      </Button>
      <Button
        variant="discreet"
        onClick={() => close(() => router.push("/nouveautes"))}
        className="self-center"
      >
        Toutes les nouveautés
      </Button>
    </BottomSheet>
  );
}
