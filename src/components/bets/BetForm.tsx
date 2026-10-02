"use client";

import { useActionState, useState } from "react";
import { createBetAction, updateBetAction } from "@/app/(app)/l/[ligue]/paris/actions";
import { FormMessage } from "@/components/FormMessage";
import { useFormErrors, type FormState } from "@/components/forms/use-form-errors";
import {
  Button,
  ChevronDownIcon,
  Chip,
  CloseIcon,
  FieldError,
  IconButton,
  PlusIcon,
  TextField,
} from "@/components/ui";
import { cx } from "@/lib/cx";
import { atTime, toLocalInput } from "@/lib/time-format";
import type { Moment } from "@/server/bets/rules";

const moments: { value: Moment; label: string }[] = [
  { value: "BEFORE", label: "Before" },
  { value: "NIGHT", label: "Night" },
  { value: "AFTER", label: "After" },
  { value: "DAILY", label: "Daily" },
  { value: "SPECIAL", label: "Spécial" },
];

export type BetFormInitial = {
  question: string;
  options: string[];
  moment: Moment;
  /** Ouverture future, ou null pour « Maintenant ». */
  opensAt: Date | null;
  closesAt: Date;
  hiddenUntilOpen: boolean;
  /** Pari déjà ouvert : l'ouverture ne se modifie plus. */
  opened: boolean;
};

const label = (date: Date) => {
  const text = atTime(date, new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Ligne de date de la maquette, avec le champ natif par-dessus. */
function DateRow({
  title,
  value,
  placeholder,
  onChange,
  error,
  disabled,
}: {
  title: string;
  value: Date | null;
  placeholder: string;
  onChange: (date: Date | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = `date-${title}`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[12px] leading-4 font-semibold text-ink-muted">
        {title}
      </label>
      <div
        className={cx(
          "relative flex h-[52px] items-center justify-between rounded-md border bg-surface px-4 text-[15px]",
          error ? "border-loss" : "border-line-strong",
          disabled && "opacity-45",
        )}
      >
        <span className="truncate">{value ? label(value) : placeholder}</span>
        <span className="flex text-ink-subtle">
          <ChevronDownIcon size={16} />
        </span>
        <input
          id={id}
          type="datetime-local"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          value={value ? toLocalInput(value) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

export function BetForm({
  leagueId,
  betId,
  initial,
}: {
  leagueId: string;
  betId?: string;
  initial?: BetFormInitial;
}) {
  const action = betId
    ? updateBetAction.bind(null, leagueId, betId)
    : createBetAction.bind(null, leagueId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const { formRef, formError, error, clear } = useFormErrors(state);

  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options ?? ["", ""]);
  const [moment, setMoment] = useState<Moment | null>(initial?.moment ?? null);
  const [opensAt, setOpensAt] = useState<Date | null>(initial?.opensAt ?? null);
  const [closesAt, setClosesAt] = useState<Date | null>(
    () => initial?.closesAt ?? new Date(Date.now() + 2 * 3600_000),
  );
  const [mystery, setMystery] = useState(initial?.hiddenUntilOpen ?? false);

  return (
    <form ref={formRef} action={formAction} className="flex grow flex-col gap-5" noValidate>
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Question"
        name="question"
        maxLength={140}
        error={error("question")}
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value);
          clear("question");
        }}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[12px] leading-4 font-semibold text-ink-muted">
          Options, de 2 à 8
        </legend>
        {options.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <label htmlFor={`option-${i}`} className="sr-only">
              Option {i + 1}
            </label>
            <input
              id={`option-${i}`}
              name="option"
              maxLength={40}
              value={value}
              aria-invalid={error("options") ? true : undefined}
              onChange={(e) => {
                setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)));
                clear("options");
              }}
              className={cx(
                "h-[48px] min-w-0 grow rounded-md border bg-surface px-4 text-[15px] text-ink",
                error("options") ? "border-loss" : "border-line-strong",
              )}
            />
            <IconButton
              label={`Retirer l'option ${i + 1}`}
              className="text-ink-subtle"
              disabled={options.length <= 2}
              onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
            >
              <CloseIcon size={20} />
            </IconButton>
          </div>
        ))}
        {error("options") && <FieldError id="options-error">{error("options")!}</FieldError>}
        {options.length < 8 && (
          <button
            type="button"
            onClick={() => setOptions((list) => [...list, ""])}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-line-strong bg-bg text-[14px] font-semibold text-ink-muted"
          >
            <PlusIcon size={18} />
            Ajouter une option
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[12px] leading-4 font-semibold text-ink-muted">Moment</legend>
        <input type="hidden" name="moment" value={moment ?? ""} />
        <div className="flex flex-wrap gap-2">
          {moments.map((m) => (
            <Chip
              key={m.value}
              selected={moment === m.value}
              aria-invalid={error("moment") ? true : undefined}
              onClick={() => {
                setMoment(m.value);
                clear("moment");
              }}
            >
              {m.label}
            </Chip>
          ))}
        </div>
        {error("moment") && <FieldError id="moment-error">{error("moment")!}</FieldError>}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <input type="hidden" name="opensAt" value={opensAt ? opensAt.toISOString() : ""} />
        <input type="hidden" name="closesAt" value={closesAt ? closesAt.toISOString() : ""} />
        <DateRow
          title="Ouverture"
          value={opensAt}
          placeholder="Maintenant"
          disabled={initial?.opened}
          error={error("opensAt")}
          onChange={(d) => {
            setOpensAt(d);
            clear("opensAt");
            clear("hiddenUntilOpen");
          }}
        />
        <DateRow
          title="Fermeture"
          value={closesAt}
          placeholder="À choisir"
          error={error("closesAt")}
          onChange={(d) => {
            setClosesAt(d);
            clear("closesAt");
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-[52px] items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">Pari mystère</span>
            <span className="text-caption text-ink-subtle">
              Question cachée jusqu&apos;à l&apos;ouverture
            </span>
          </span>
          {mystery && <input type="hidden" name="hiddenUntilOpen" value="on" />}
          <button
            type="button"
            aria-pressed={mystery}
            aria-label="Pari mystère"
            onClick={() => {
              setMystery((v) => !v);
              clear("hiddenUntilOpen");
            }}
            className={cx(
              "flex h-[32px] w-[52px] shrink-0 items-center rounded-full border p-1",
              mystery
                ? "justify-end border-brand bg-brand-soft"
                : "justify-start border-line-strong bg-surface-raised",
            )}
          >
            <span
              className={cx("size-[22px] rounded-full", mystery ? "bg-brand" : "bg-ink-muted")}
            />
          </button>
        </div>
        {error("hiddenUntilOpen") && (
          <FieldError id="mystery-error">{error("hiddenUntilOpen")!}</FieldError>
        )}
      </div>

      <div className="grow" />
      <Button type="submit" disabled={pending}>
        {betId ? "Enregistrer" : "Publier le pari"}
      </Button>
    </form>
  );
}
