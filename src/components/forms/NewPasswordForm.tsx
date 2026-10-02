"use client";

import { useActionState, useState } from "react";
import { newPasswordAction } from "@/app/(compte)/actions";
import { FormMessage } from "@/components/FormMessage";
import { Button, TextField } from "@/components/ui";
import { useFormErrors, type FormState } from "./use-form-errors";

export function NewPasswordForm({ token, expired }: { token: string; expired: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    newPasswordAction,
    expired ? { formError: expired } : {},
  );
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [password, setPassword] = useState("");

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="8 caractères minimum."
        error={error("password")}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          clear("password");
        }}
      />
      <div className="grow" />
      <Button type="submit" disabled={pending}>
        Changer le mot de passe
      </Button>
    </form>
  );
}
