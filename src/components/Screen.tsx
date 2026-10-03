import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Colonne de l'app : pleine largeur sur mobile, 480 px au plus au-delà. Le
 * haut passe sous la barre d'état en app installée, jamais l'en-tête ; le bas
 * respecte la zone de l'indicateur d'accueil, sauf sous une barre d'onglets
 * qui s'en charge (`safeBottom={false}`).
 */
export function Screen({
  children,
  className,
  safeBottom = true,
}: {
  children: ReactNode;
  className?: string;
  safeBottom?: boolean;
}) {
  return (
    <div
      className={cx(
        "mx-auto flex min-h-dvh w-full max-w-[480px] flex-col pt-[env(safe-area-inset-top)]",
        safeBottom && "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
