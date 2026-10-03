import { cx } from "@/lib/cx";
import type { MemberStats } from "@/server/stats";

const MINUS = "−";

function Tile({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-surface px-2 py-3">
      <span className={cx("font-mono text-[18px] leading-6 font-medium", tone ?? "text-ink")}>
        {value}
      </span>
      <span className="text-caption text-ink-muted">{label}</span>
    </div>
  );
}

/** Les quatre chiffres d'un membre : paris, gagnés, réussite, bilan. */
export function StatGrid({ stats }: { stats: MemberStats }) {
  const net =
    stats.net > 0 ? `+${stats.net}` : stats.net < 0 ? `${MINUS}${-stats.net}` : String(stats.net);
  return (
    <div className="grid shrink-0 grid-cols-4 gap-2">
      <Tile value={String(stats.bets)} label={stats.bets > 1 ? "paris" : "pari"} />
      <Tile value={String(stats.won)} label={stats.won > 1 ? "gagnés" : "gagné"} />
      <Tile value={stats.successRate === null ? "—" : `${stats.successRate} %`} label="réussite" />
      <Tile
        value={net}
        label="bilan"
        tone={stats.net > 0 ? "text-win" : stats.net < 0 ? "text-loss" : undefined}
      />
    </div>
  );
}
