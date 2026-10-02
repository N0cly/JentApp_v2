"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpAction } from "@/app/(compte)/actions";
import { CheckboxField } from "@/components/CheckboxField";
import { FormMessage } from "@/components/FormMessage";
import { Button, TextField } from "@/components/ui";
import { useFormErrors, type FormState } from "./use-form-errors";

export function SignUpForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [values, setValues] = useState({ username: "", email: "", password: "", terms: false });
  const signInHref = next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion";

  function set<K extends keyof typeof values>(name: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [name]: value }));
    clear(name);
  }

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {formError && <FormMessage>{formError}</FormMessage>}
      <TextField
        label="Pseudo"
        name="username"
        autoComplete="username"
        hint="3 à 20 caractères. C'est le nom que voient tes ligues."
        error={error("username")}
        value={values.username}
        onChange={(e) => set("username", e.target.value)}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        hint="Jamais montré aux autres joueurs. Un lien de confirmation t'est envoyé."
        error={error("email")}
        value={values.email}
        onChange={(e) => set("email", e.target.value)}
      />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="8 caractères minimum."
        error={error("password")}
        value={values.password}
        onChange={(e) => set("password", e.target.value)}
      />
      <CheckboxField
        name="terms"
        checked={values.terms}
        onChange={(e) => set("terms", e.target.checked)}
        error={error("terms")}
        label={
          <>
            J&apos;ai 18 ans ou plus et j&apos;accepte les{" "}
            <Link href="/conditions" className="font-semibold text-brand">
              conditions d&apos;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/confidentialite" className="font-semibold text-brand">
              politique de confidentialité
            </Link>
            .
          </>
        }
      />
      <div className="grow" />
      <Button type="submit" disabled={pending}>
        Créer mon compte
      </Button>
      <Button variant="discreet" href={signInHref}>
        J&apos;ai déjà un compte
      </Button>
    </form>
  );
}
