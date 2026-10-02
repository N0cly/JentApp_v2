import { useId, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { AlertIcon } from "./icons";

type TextFieldProps = {
  /** Libellé visible au-dessus du champ. */
  label: string;
  /** Aide sous le champ. */
  hint?: string;
  /** Message d'erreur : remplace l'aide, bordure en `loss`. */
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function TextField({
  label,
  hint,
  error,
  type = "text",
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-[12px] leading-4 font-semibold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "h-[52px] rounded-md border bg-surface px-4 text-[15px] text-ink",
          error ? "border-loss" : "border-line-strong",
        )}
        {...props}
      />
      {error ? <FieldError id={noteId}>{error}</FieldError> : null}
      {!error && hint ? (
        <span id={noteId} className="text-caption text-ink-subtle">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Message sous un champ ou une case : icône d'alerte puis texte, en `loss`. */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="text-caption flex items-start gap-1 text-loss">
      <AlertIcon size={16} />
      {children}
    </span>
  );
}
