"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/use-form-errors";
import { deleteAccount } from "@/server/account";
import { requireUser } from "@/server/auth";

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteAccount(user, form.get("confirmation"));
  if (!result.ok) return { fieldErrors: result.fieldErrors, formError: result.formError };
  // Les sessions sont effacées en base ; on retire aussi les cookies du navigateur.
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (cookie.name.includes("better-auth")) jar.delete(cookie.name);
  }
  redirect("/connexion");
}
