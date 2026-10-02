import { cx } from "@/lib/cx";

type Size = 32 | 36 | 40 | 48 | 56 | 64 | 72;

type AvatarProps = {
  name: string;
  size?: Size;
  /**
   * Couleur de l'anneau : la bordure portée (teinte du cosmétique) ou un jeton
   * passé en `var(--…)`. Par défaut `line-strong`.
   */
  ring?: string;
  ringWidth?: 2 | 3;
  className?: string;
};

/** Joueur : rond, avec son initiale. */
export function Avatar({ name, size = 40, ring, ringWidth = 2, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full border-line-strong bg-surface font-bold",
        ringWidth === 2 ? "border-2" : "border-3",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        borderColor: ring,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
