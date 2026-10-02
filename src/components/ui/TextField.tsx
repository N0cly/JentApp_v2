import { useId, type InputHTMLAttributes } from "react";

type TextFieldProps = {
  /** Libellé visible au-dessus du champ. */
  label: string;
  /** Aide sous le champ. */
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function TextField({ label, hint, type = "text", ...props }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[12px] leading-4 font-semibold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        aria-describedby={hint ? hintId : undefined}
        className="h-[52px] rounded-md border border-line-strong bg-surface px-4 text-[15px] text-ink"
        {...props}
      />
      {hint && (
        <span id={hintId} className="text-caption text-ink-subtle">
          {hint}
        </span>
      )}
    </div>
  );
}
