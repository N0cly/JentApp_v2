import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldError } from "@/components/ui";

type CheckboxFieldProps = {
  label: ReactNode;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">;

/** Case à cocher avec son libellé ; l'erreur s'affiche sous la case. */
export function CheckboxField({ label, error, ...props }: CheckboxFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[44px] items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-px size-[22px] shrink-0 accent-brand"
          {...props}
        />
        <label htmlFor={id} className="text-[13px] leading-[18px] text-ink-muted">
          {label}
        </label>
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
