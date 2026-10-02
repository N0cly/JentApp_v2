import { cx } from "@/lib/cx";
import { ClopeIcon, JointIcon, PaquetIcon } from "./icons";

type Size = "sm" | "md" | "lg" | "xl";
type Unit = "clope" | "joint" | "paquet";

const sizes: Record<Size, { text: string; icon: number; gap: string }> = {
  sm: { text: "text-[13px] leading-[18px]", icon: 14, gap: "gap-1" },
  md: { text: "text-[15px] leading-5", icon: 16, gap: "gap-1" },
  lg: { text: "text-[28px] leading-8", icon: 20, gap: "gap-1" },
  xl: { text: "text-[44px] leading-[48px]", icon: 28, gap: "gap-2" },
};

const icons = { clope: ClopeIcon, joint: JointIcon, paquet: PaquetIcon };

const MINUS = "−";

type AmountProps = {
  value: number;
  /** Variation : signe explicite, `win` si positive, `loss` si négative. */
  delta?: boolean;
  size?: Size;
  /** Icône d'unité. Par défaut la clope, sauf pour une variation. */
  unit?: Unit | null;
  className?: string;
};

export function Amount({ value, delta = false, size = "md", unit, className }: AmountProps) {
  const { text, icon, gap } = sizes[size];
  const shownUnit = unit === undefined ? (delta ? null : "clope") : unit;
  const Icon = shownUnit ? icons[shownUnit] : null;

  const sign = delta ? (value > 0 ? "+" : value < 0 ? MINUS : "") : value < 0 ? MINUS : "";
  const tone = delta ? (value > 0 ? "text-win" : value < 0 ? "text-loss" : undefined) : undefined;

  return (
    <span
      className={cx("inline-flex items-center font-mono font-medium", text, gap, tone, className)}
    >
      {sign}
      {Math.abs(value)}
      {Icon && (
        <span className="flex text-brand">
          <Icon size={icon} />
        </span>
      )}
    </span>
  );
}
