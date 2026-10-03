"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction } from "@/app/(compte)/actions";
import { FormMessage } from "@/components/FormMessage";
import { Button, TextField } from "@/components/ui";
import { useFormErrors, type FormState } from "./use-form-errors";

export function SignInForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const { formRef, formError } = useFormErrors(state);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Après un refus, le mot de passe est vidé (connexion-erreur.html).
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setPassword("");
  }
  const signUpHref = next ? `/inscription?next=${encodeURIComponent(next)}` : "/inscription";

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Link
        href="/mot-de-passe-oublie"
        className="flex min-h-[44px] items-center self-end text-[14px] font-semibold text-ink-muted"
      >
        Mot de passe oublié ?
      </Link>
      <div className="grow" />
      <Button type="submit" disabled={pending}>
        Se connecter
      </Button>
      <p className="flex min-h-[44px] items-center justify-center gap-1 text-[14px] text-ink-muted">
        Pas encore de compte ?
        <Link href={signUpHref} className="flex min-h-[44px] items-center font-semibold text-brand">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
