import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type CardProps = { children: ReactNode } & HTMLAttributes<HTMLElement>;

/** Carte de pari : fond surface, intérieur space-4, 12 px entre les blocs. */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <article className={cx("flex flex-col gap-3 rounded-lg bg-surface p-4", className)} {...props}>
      {children}
    </article>
  );
}
