import { cx } from "@/lib/cx";

/** Un seul par écran, sur le ticket. */
export function Stamp({ outcome }: { outcome: "won" | "lost" }) {
  return (
    <span
      className={cx(
        "block -rotate-6 rounded-sm border-2 px-2 py-1 font-mono text-[16px] leading-5 font-medium tracking-[0.12em] uppercase",
        outcome === "won"
          ? "border-on-paper-win text-on-paper-win"
          : "border-on-paper-loss text-on-paper-loss",
      )}
    >
      {outcome === "won" ? "Gagné" : "Perdu"}
    </span>
  );
}
