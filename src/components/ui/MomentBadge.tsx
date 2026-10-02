export type Moment = "BEFORE" | "NIGHT" | "AFTER" | "DAILY" | "SPECIAL";

const labels: Record<Moment, string> = {
  BEFORE: "BEFORE",
  NIGHT: "NIGHT",
  AFTER: "AFTER",
  DAILY: "DAILY",
  SPECIAL: "SPÉCIAL",
};

/** Les cinq moments ont la même apparence. */
export function MomentBadge({ moment }: { moment: Moment }) {
  return (
    <span className="text-overline rounded-sm border border-line-strong px-2 py-1 text-ink-muted">
      {labels[moment]}
    </span>
  );
}
