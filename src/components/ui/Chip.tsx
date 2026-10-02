import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type ChipProps = {
  selected?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function Chip({ selected = false, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        "min-h-[44px] shrink-0 rounded-full border px-4 text-[14px] leading-5 font-semibold",
        selected ? "border-ink bg-ink text-on-paper" : "border-line-strong bg-bg text-ink-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
