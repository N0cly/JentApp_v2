"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms/use-form-errors";
import { changePassword, changeUsername, requestEmailChange, requireUser } from "@/server/auth";

function done(result: {
  ok: boolean;
  fieldErrors?: Partial<Record<string, string>>;
  formError?: string;
}): FormState {
  if (result.ok) {
    revalidatePath("/", "layout");
    return { done: true };
  }
  return { fieldErrors: result.fieldErrors, formError: result.formError };
}

export async function changeUsernameAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  return done(await changeUsername(user.id, { username: form.get("username") }));
}

export async function changeEmailAction(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  return done(await requestEmailChange({ email: form.get("email") }, await headers()));
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  return done(
    await changePassword(
      { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") },
      await headers(),
    ),
  );
}
