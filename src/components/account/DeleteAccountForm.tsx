"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction } from "@/app/(app)/compte/supprimer/actions";
import { FormMessage } from "@/components/FormMessage";
import { useFormErrors, type FormState } from "@/components/forms/use-form-errors";
import { Button, TextField } from "@/components/ui";

export function DeleteAccountForm({ username, blocked }: { username: string; blocked: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [confirmation, setConfirmation] = useState("");
  const ready = !blocked && confirmation.trim() === username;

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Écris ton pseudo pour confirmer"
        name="confirmation"
        autoComplete="off"
        error={error("confirmation")}
        value={confirmation}
        onChange={(e) => {
          setConfirmation(e.target.value);
          clear("confirmation");
        }}
      />
      <div className="grow" />
      <Button variant="danger" type="submit" disabled={!ready || pending}>
        Supprimer définitivement
      </Button>
      <p className="text-caption text-ink-subtle">
        Le bouton s&apos;active quand tu n&apos;es plus owner d&apos;aucune ligue et que le pseudo
        est saisi.
      </p>
    </form>
  );
}
