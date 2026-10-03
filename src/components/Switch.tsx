import { cx } from "@/lib/cx";

/** Interrupteur (catalogue.html, reglages-du-compte.html). */
export function Switch({
  label,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        "flex h-[32px] w-[52px] shrink-0 items-center rounded-full border p-1 disabled:opacity-45",
        on
          ? "justify-end border-brand bg-brand"
          : "justify-start border-line-strong bg-surface-raised",
      )}
    >
      <span className={cx("size-[22px] rounded-full", on ? "bg-on-brand" : "bg-ink-muted")} />
    </button>
  );
}
