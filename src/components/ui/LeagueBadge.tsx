import { cx } from "@/lib/cx";

type LeagueBadgeProps = {
  name: string;
  /** `sm` dans le sélecteur, `md` dans la liste des ligues. */
  size?: "sm" | "md";
  active?: boolean;
};

/** Carré arrondi avec l'initiale, pour ne pas confondre une ligue avec un joueur. */
export function LeagueBadge({ name, size = "md", active = false }: LeagueBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center border font-extrabold",
        size === "sm" ? "size-[28px] rounded-sm text-[14px]" : "size-[40px] rounded-md text-[17px]",
        active
          ? "border-brand bg-brand text-on-brand"
          : "border-line-strong bg-surface-raised text-ink",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
