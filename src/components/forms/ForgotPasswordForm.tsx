"use client";

import { useActionState, useState } from "react";
import { forgotPasswordAction } from "@/app/(compte)/actions";
import { FormMessage } from "@/components/FormMessage";
import { Button, TextField } from "@/components/ui";
import { useFormErrors, type FormState } from "./use-form-errors";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [email, setEmail] = useState("");

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={error("email")}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          clear("email");
        }}
      />
      <p className="text-caption text-ink-subtle">
        Si un compte existe pour cet email, le lien arrive dans quelques minutes.
      </p>
      <div className="grow" />
      <Button type="submit" disabled={pending}>
        Envoyer le lien
      </Button>
    </form>
  );
}
