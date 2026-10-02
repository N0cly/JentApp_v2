"use client";

import { useActionState, useState } from "react";
import { updateEconomyAction } from "@/app/(app)/league-actions";
import { useFormErrors, type FormState } from "@/components/forms/use-form-errors";
import { ListGroup } from "@/components/List";
import { Stepper } from "@/components/Stepper";
import { BottomSheet, Button, FieldError } from "@/components/ui";

export type EconomyField = "joinGrant" | "weeklyGrant" | "seedAmount";

export const economyControls: Record<
  EconomyField,
  { label: string; hint: string; max: number; step: number }
> = {
  joinGrant: { label: "Dotation de départ", hint: "Reçue une fois par membre", max: 200, step: 5 },
  weeklyGrant: {
    label: "Allocation hebdomadaire",
    hint: "Pour chaque membre actif",
    max: 50,
    step: 5,
  },
  seedAmount: {
    label: "Cagnotte par pari",
    hint: "Ajoutée au pot, sous conditions",
    max: 20,
    step: 1,
  },
};

/** Modifier une valeur d'économie : le contrôle de « Créer une ligue » et « Enregistrer ». */
export function EconomySheet({
  leagueId,
  field,
  value,
  onClose,
}: {
  leagueId: string;
  field: EconomyField;
  value: number;
  onClose: () => void;
}) {
  const control = economyControls[field];
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateEconomyAction.bind(null, leagueId, field),
    {},
  );
  const { formRef, error } = useFormErrors(state);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.done) onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={control.label}>
      <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
        <ListGroup>
          <Stepper
            name="value"
            label={control.label}
            hint={control.hint}
            min={0}
            max={control.max}
            step={control.step}
            defaultValue={value}
          />
        </ListGroup>
        {error("value") && <FieldError id="economy-error">{error("value")!}</FieldError>}
        <p className="text-caption text-ink-subtle">Un changement ne vaut que pour la suite.</p>
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
      </form>
    </BottomSheet>
  );
}
