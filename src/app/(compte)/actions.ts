"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/use-form-errors";
import {
  requestPasswordReset,
  requireUser,
  resendVerification,
  resetPassword,
  safeNext,
  signIn,
  signOut,
  signUp,
} from "@/server/auth";

function failure(result: {
  fieldErrors?: Partial<Record<string, string>>;
  formError?: string;
}): FormState {
  return { fieldErrors: result.fieldErrors, formError: result.formError };
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await signIn(
    { email: form.get("email"), password: form.get("password") },
    await headers(),
    new Date(),
  );
  if (!result.ok) return failure(result);
  redirect(safeNext(form.get("next")) ?? "/");
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await signUp(
    {
      username: form.get("username"),
      email: form.get("email"),
      password: form.get("password"),
      terms: form.get("terms") === "on",
    },
    await headers(),
    new Date(),
  );
  if (!result.ok) return failure(result);
  // Présentation d'abord, puis l'invitation si on venait d'un lien.
  const next = safeNext(form.get("next"));
  redirect(
    next ? `/bienvenue/presentation?suite=${encodeURIComponent(next)}` : "/bienvenue/presentation",
  );
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await requestPasswordReset(
    { email: form.get("email") },
    await headers(),
    new Date(),
  );
  if (!result.ok) return failure(result);
  redirect("/connexion");
}

export async function newPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await resetPassword({ token: form.get("token"), password: form.get("password") });
  if (!result.ok) return failure(result);
  redirect("/connexion");
}

export async function signOutAction() {
  await signOut(await headers());
  redirect("/connexion");
}

export type ResendState = { sent?: boolean; error?: string };

export async function resendVerificationAction(): Promise<ResendState> {
  const user = await requireUser();
  if (user.emailVerified) return { sent: true };
  const result = await resendVerification(user, new Date());
  return result.ok ? { sent: true } : { error: result.formError };
}
