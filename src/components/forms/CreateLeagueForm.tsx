"use client";

import { useActionState, useState } from "react";
import { createLeagueAction } from "@/app/(app)/league-actions";
import { FormMessage } from "@/components/FormMessage";
import { ListGroup, SectionTitle } from "@/components/List";
import { Stepper } from "@/components/Stepper";
import { Button, FieldError, TextField } from "@/components/ui";
import { useFormErrors, type FormState } from "./use-form-errors";

export function CreateLeagueForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createLeagueAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [name, setName] = useState("");
  const economyError = error("joinGrant") ?? error("weeklyGrant") ?? error("seedAmount");

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Nom de la ligue"
        name="name"
        maxLength={30}
        error={error("name")}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          clear("name");
        }}
      />
      <SectionTitle>ÉCONOMIE DE LA LIGUE, EN CLOPES</SectionTitle>
      <ListGroup>
        <Stepper
          name="joinGrant"
          label="Dotation de départ"
          hint="Reçue une fois par membre"
          min={0}
          max={200}
          step={5}
          defaultValue={50}
        />
        <Stepper
          name="weeklyGrant"
          label="Allocation hebdomadaire"
          hint="Pour chaque membre actif"
          min={0}
          max={50}
          step={5}
          defaultValue={10}
        />
        <Stepper
          name="seedAmount"
          label="Cagnotte par pari"
          hint="Ajoutée au pot, sous conditions"
          min={0}
          max={20}
          step={1}
          defaultValue={5}
        />
      </ListGroup>
      {economyError && <FieldError id="economy-error">{economyError}</FieldError>}
      <p className="text-caption text-ink-subtle">
        Modifiable plus tard. Un changement ne vaut que pour la suite.
      </p>
      <div className="grow" />
      <Button type="submit" disabled={pending}>
        Créer la ligue
      </Button>
    </form>
  );
}
