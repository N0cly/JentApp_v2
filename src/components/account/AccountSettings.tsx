"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  changeEmailAction,
  changePasswordAction,
  changeUsernameAction,
} from "@/app/(app)/compte/actions";
import { FormMessage } from "@/components/FormMessage";
import { useFormErrors, type FormState } from "@/components/forms/use-form-errors";
import { ListGroup, ListRow } from "@/components/List";
import { BottomSheet, Button, TextField } from "@/components/ui";

type Sheet = "username" | "email" | "password" | null;

export function ProfileRows({
  username,
  email,
  photoRow,
}: {
  username: string;
  email: string;
  photoRow?: ReactNode;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  return (
    <>
      <ListGroup>
        {photoRow}
        <ListRow label="Pseudo" value={username} onClick={() => setSheet("username")} />
        <ListRow label="Email" value={email} onClick={() => setSheet("email")} />
        <ListRow label="Mot de passe" value="Modifier" onClick={() => setSheet("password")} />
      </ListGroup>
      <UsernameSheet open={sheet === "username"} onClose={close} current={username} />
      <EmailSheet open={sheet === "email"} onClose={close} />
      <PasswordSheet open={sheet === "password"} onClose={close} />
    </>
  );
}

/** Ferme la feuille quand l'action a abouti. */
function useCloseOnDone(state: FormState, onClose: () => void) {
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.done) onClose();
  }
}

function UsernameSheet({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeUsernameAction, {});
  const { formRef, error, clear } = useFormErrors(state);
  const [value, setValue] = useState(current);
  useCloseOnDone(state, onClose);
  return (
    <BottomSheet open={open} onClose={onClose} title="Pseudo">
      <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Pseudo"
          name="username"
          autoComplete="username"
          hint="3 à 20 caractères. C'est le nom que voient tes ligues."
          error={error("username")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            clear("username");
          }}
        />
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
      </form>
    </BottomSheet>
  );
}

function EmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeEmailAction, {});
  const { formRef, error, clear } = useFormErrors(state);
  const [value, setValue] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="Email">
      {state.done ? (
        <p role="status" className="text-body text-ink-muted">
          Un lien est parti à {value}. Ton email change quand tu l&apos;ouvres.
        </p>
      ) : (
        <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Nouvel email"
            name="email"
            type="email"
            autoComplete="email"
            hint="Jamais montré aux autres joueurs. Un lien de confirmation t'est envoyé."
            error={error("email")}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              clear("email");
            }}
          />
          <Button type="submit" disabled={pending}>
            Envoyer le lien
          </Button>
        </form>
      )}
    </BottomSheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [values, setValues] = useState({ currentPassword: "", newPassword: "" });
  useCloseOnDone(state, onClose);
  const set = (name: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    clear(name);
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Mot de passe">
      <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
        {formError && <FormMessage>{formError}</FormMessage>}
        <TextField
          label="Mot de passe actuel"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={error("currentPassword")}
          value={values.currentPassword}
          onChange={(e) => set("currentPassword", e.target.value)}
        />
        <TextField
          label="Nouveau mot de passe"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint="8 caractères minimum. Tes autres appareils seront déconnectés."
          error={error("newPassword")}
          value={values.newPassword}
          onChange={(e) => set("newPassword", e.target.value)}
        />
        <Button type="submit" disabled={pending}>
          Changer le mot de passe
        </Button>
      </form>
    </BottomSheet>
  );
}
