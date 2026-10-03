import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "discreet" | "danger";

type ButtonProps = {
  variant?: Variant;
  /** Le bouton discret peut porter une action qui détruit : texte en `loss`. */
  destructive?: boolean;
  href?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const variants: Record<Variant, string> = {
  // Un par écran, 56 px en bas d'écran.
  primary: "min-h-[56px] w-full bg-brand text-on-brand text-[17px] leading-[22px] font-bold",
  secondary:
    "min-h-[52px] w-full bg-surface border border-line-strong text-[15px] leading-5 font-bold",
  discreet: "min-h-[44px] px-3 text-[14px] leading-5 font-semibold text-ink-muted",
  danger: "min-h-[56px] w-full bg-loss text-on-paper text-[17px] leading-[22px] font-bold",
};

export function Button({
  variant = "primary",
  destructive = false,
  href,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = cx(
    // Un nom de ligue ou un pseudo dans le libellé se coupe plutôt que de déborder.
    "flex items-center justify-center gap-2 rounded-md text-center [overflow-wrap:anywhere] disabled:opacity-45",
    variants[variant],
    variant === "discreet" && destructive && "text-loss",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
