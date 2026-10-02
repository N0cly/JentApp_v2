"use client";

import { useState } from "react";
import { IconButton, MinusIcon, PlusIcon } from "@/components/ui";

type StepperProps = {
  name: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

/** Entier borné : − et + par pas, ou saisie au clavier. */
export function Stepper({ name, label, hint, min, max, step, defaultValue }: StepperProps) {
  const [value, setValue] = useState(String(defaultValue));
  const current = Number.parseInt(value, 10);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const shift = (delta: number) =>
    setValue((previous) => {
      const n = Number.parseInt(previous, 10);
      return String(clamp((Number.isNaN(n) ? defaultValue : n) + delta));
    });

  return (
    <div>
      <div className="flex min-h-[64px] items-center justify-between gap-2">
        <span className="flex flex-col">
          <label htmlFor={`stepper-${name}`} className="text-[15px] leading-5 font-semibold">
            {label}
          </label>
          {hint && <span className="text-caption text-ink-subtle">{hint}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <IconButton
            label={`Moins, ${label}`}
            variant="outlined"
            className="bg-surface-raised"
            disabled={!Number.isNaN(current) && current <= min}
            onClick={() => shift(-step)}
          >
            <MinusIcon size={20} />
          </IconButton>
          <input
            id={`stepper-${name}`}
            name={name}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={() => setValue(String(clamp(Number.isNaN(current) ? min : current)))}
            className="w-[36px] bg-transparent text-center font-mono text-[20px] font-medium"
          />
          <IconButton
            label={`Plus, ${label}`}
            variant="outlined"
            className="bg-surface-raised"
            disabled={!Number.isNaN(current) && current >= max}
            onClick={() => shift(step)}
          >
            <PlusIcon size={20} />
          </IconButton>
        </span>
      </div>
    </div>
  );
}
