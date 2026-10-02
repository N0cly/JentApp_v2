import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Colonne de l'app : pleine largeur sur mobile, 480 px au plus au-delà. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("mx-auto flex min-h-dvh w-full max-w-[480px] flex-col", className)}>
      {children}
    </div>
  );
}
