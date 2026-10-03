"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Un titre qui est un pseudo se coupe avec des points de suspension ; sinon il passe à la ligne. */
  truncateTitle?: boolean;
  children: ReactNode;
};

/** Feuille modale : surface-raised, haut en radius-lg, poignée, bouton fermer. */
export function BottomSheet({
  open,
  onClose,
  title,
  truncateTitle = false,
  children,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Un toucher sur le fond assombri ferme la feuille.
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-[480px] bg-transparent p-0 text-ink backdrop:bg-bg/70"
    >
      <section className="flex flex-col gap-3 rounded-t-lg bg-surface-raised px-5 pt-3 pb-[calc(var(--space-6)+env(safe-area-inset-bottom))]">
        <div
          aria-hidden="true"
          className="h-[4px] w-[36px] self-center rounded-full bg-line-strong"
        />
        <div className="flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className={cx(
              "min-w-0 text-[24px] leading-[28px] font-extrabold tracking-[-0.01em] [font-stretch:85%]",
              truncateTitle ? "truncate" : "[overflow-wrap:anywhere]",
            )}
          >
            {title}
          </h2>
          <IconButton label="Fermer" onClick={onClose}>
            <CloseIcon size={22} />
          </IconButton>
        </div>
        {children}
      </section>
    </dialog>
  );
}
