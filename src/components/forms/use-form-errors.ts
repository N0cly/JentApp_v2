"use client";

import { useEffect, useRef, useState } from "react";

export type FormState = {
  fieldErrors?: Partial<Record<string, string>>;
  formError?: string;
  /** L'action a abouti sans changer de page (une feuille peut se fermer). */
  done?: boolean;
};

/**
 * Erreurs d'un envoi : toutes ensemble, focus sur le premier champ en erreur,
 * et chacune disparaît dès que son champ est modifié.
 */
export function useFormErrors(state: FormState) {
  const formRef = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState(state);
  const [cleared, setCleared] = useState<string[]>([]);
  if (current !== state) {
    setCurrent(state);
    setCleared([]);
  }

  useEffect(() => {
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
  }, [state]);

  return {
    formRef,
    formError: state.formError,
    error: (name: string) => (cleared.includes(name) ? undefined : state.fieldErrors?.[name]),
    clear: (name: string) =>
      setCleared((names) => (names.includes(name) ? names : [...names, name])),
  };
}
