"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms/use-form-errors";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import {
  changeRole,
  createLeague,
  deleteLeague,
  joinLeague,
  leaveLeague,
  previewInvite,
  regenerateInviteCode,
  removeMember,
  renameLeague,
  transferLeague,
  type InvitePreview,
} from "@/server/leagues";

/** Une ligue qu'on ne doit pas voir répond 404, ici comme dans les pages. */
async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

function failure(result: {
  fieldErrors?: Partial<Record<string, string>>;
  formError?: string;
}): FormState {
  return { fieldErrors: result.fieldErrors, formError: result.formError };
}

export async function createLeagueAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await createLeague(
    user,
    {
      name: form.get("name"),
      joinGrant: form.get("joinGrant"),
      weeklyGrant: form.get("weeklyGrant"),
      seedAmount: form.get("seedAmount"),
    },
    new Date(),
  );
  if (!result.ok) return failure(result);
  redirect(`/l/${result.leagueId}/inviter?nouvelle=1`);
}

export type PreviewState = { preview?: InvitePreview; error?: string };

export async function previewInviteAction(
  code: string,
  invitedBy: string | null,
): Promise<PreviewState> {
  const user = await requireUser();
  const result = await previewInvite(user, code, new Date(), invitedBy);
  if (result.ok) return { preview: result.preview };
  return { error: result.fieldErrors?.code ?? result.formError };
}

export async function joinLeagueAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await joinLeague(user, form.get("code"), new Date());
  if (!result.ok) return failure(result);
  redirect(`/l/${result.leagueId}/paris`);
}

export async function leaveLeagueAction(leagueId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await orNotFound(() => leaveLeague(user, leagueId, new Date()));
  if (!result.ok) return failure(result);
  redirect("/");
}

export async function changeRoleAction(leagueId: string, userId: string, role: "player" | "admin") {
  const user = await requireUser();
  await orNotFound(() => changeRole(user, leagueId, userId, role));
  revalidatePath(`/l/${leagueId}/reglages/membres`);
}

export async function removeMemberAction(leagueId: string, userId: string) {
  const user = await requireUser();
  await orNotFound(() => removeMember(user, leagueId, userId, new Date()));
  revalidatePath(`/l/${leagueId}/reglages/membres`);
}

export async function renameLeagueAction(
  leagueId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const result = await orNotFound(() => renameLeague(user, leagueId, form.get("name")));
  if (!result.ok) return failure(result);
  revalidatePath(`/l/${leagueId}`, "layout");
  return { done: true };
}

export async function regenerateCodeAction(leagueId: string) {
  const user = await requireUser();
  await orNotFound(() => regenerateInviteCode(user, leagueId));
  revalidatePath(`/l/${leagueId}`, "layout");
}

export async function transferLeagueAction(leagueId: string, userId: string) {
  const user = await requireUser();
  await orNotFound(() => transferLeague(user, leagueId, userId));
  revalidatePath(`/l/${leagueId}`, "layout");
}

export async function deleteLeagueAction(
  leagueId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const result = await orNotFound(() => deleteLeague(user, leagueId, form.get("confirmation")));
  if (!result.ok) return failure(result);
  redirect("/");
}
