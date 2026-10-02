import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "plain" | "outlined" | "brand";

type IconButtonProps = {
  /** Obligatoire : c'est le nom lu par les lecteurs d'écran. */
  label: string;
  variant?: Variant;
  /** `lg` : 56 px, pour le pas de mise du ticket. */
  size?: "md" | "lg";
  href?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

const variants: Record<Variant, string> = {
  plain: "text-ink-muted",
  outlined: "bg-surface border border-line-strong text-ink",
  brand: "bg-brand text-on-brand",
};

export function IconButton({
  label,
  variant = "plain",
  size = "md",
  href,
  className,
  children,
  type = "button",
  ...props
}: IconButtonProps) {
  const classes = cx(
    "relative flex shrink-0 items-center justify-center rounded-full disabled:opacity-45",
    size === "md" ? "size-[44px]" : "size-[56px]",
    variants[variant],
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} aria-label={label} className={classes} {...props}>
      {children}
    </button>
  );
}
