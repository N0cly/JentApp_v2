import { ChevronDownIcon } from "./icons";
import { LeagueBadge } from "./LeagueBadge";

type LeagueSwitcherProps = {
  name: string;
  /** Ouvre la feuille « Tes ligues ». */
  onClick?: () => void;
};

/** Pilule en haut à gauche de chaque onglet : badge, nom, chevron. */
export function LeagueSwitcher({ name, onClick }: LeagueSwitcherProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Changer de ligue. Ligue active : ${name}`}
      aria-haspopup="dialog"
      className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-full border border-line-strong bg-surface pr-3 pl-2"
    >
      <LeagueBadge name={name} size="sm" active />
      <span className="min-w-0 truncate text-[15px] leading-5 font-semibold">{name}</span>
      <span className="flex shrink-0 text-ink-muted">
        <ChevronDownIcon size={16} />
      </span>
    </button>
  );
}
