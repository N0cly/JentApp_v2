"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markReleaseSeenAction } from "@/app/(app)/release-actions";
import { BottomSheet, Button } from "@/components/ui";
import { frenchSpacing } from "@/lib/typo";
import type { Release } from "@/server/releases";
import { ReleaseBody } from "./ReleaseBody";

/**
 * Feuille « Quoi de neuf » (docs/NOUVEAUTES.md, § Feuille), à la première
 * page ouverte après une mise à jour : toutes les versions que le joueur n'a
 * pas vues, la plus récente d'abord, trois au plus. Fermée de n'importe quelle
 * façon, tout est noté comme lu : elle ne revient pas.
 */
export function WhatsNewSheet({ releases }: { releases: Release[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const [latest, ...older] = releases;
  if (!latest) return null;

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
      overline={`NOUVEAUTÉS · ${latest.version}`}
      title={frenchSpacing(latest.title)}
    >
      <div className="flex max-h-[60dvh] flex-col gap-6 overflow-y-auto">
        <ReleaseBody release={latest} />
        {older.map((release) => (
          <section key={release.version} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-overline text-ink-subtle">NOUVEAUTÉS · {release.version}</p>
              <h3 className="text-[20px] leading-6 font-bold [overflow-wrap:anywhere]">
                {frenchSpacing(release.title)}
              </h3>
            </div>
            <ReleaseBody release={release} />
          </section>
        ))}
      </div>
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
