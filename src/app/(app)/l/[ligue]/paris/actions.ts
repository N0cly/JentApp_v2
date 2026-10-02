"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/forms/use-form-errors";
import { requireUser } from "@/server/auth";
import {
  cancelBet,
  correctResult,
  createBet,
  placeWager,
  resolveBet,
  settleDue,
  updateBet,
  type ResultChoice,
} from "@/server/bets";
import { NotFoundError } from "@/server/errors";

async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** Avant toute action sur un pari : les versements dus de la ligue. */
async function prepare(leagueId: string) {
  const user = await requireUser();
  const now = new Date();
  await orNotFound(() => settleDue(leagueId, now));
  return { user, now };
}

function betInput(form: FormData) {
  return {
    question: form.get("question"),
    options: form.getAll("option").map(String),
    moment: form.get("moment") ?? undefined,
    opensAt: form.get("opensAt") || null,
    closesAt: form.get("closesAt") || null,
    hiddenUntilOpen: form.get("hiddenUntilOpen") === "on",
  };
}

export async function createBetAction(
  leagueId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { user, now } = await prepare(leagueId);
  const result = await orNotFound(() => createBet(user, leagueId, betInput(form), now));
  if (!result.ok) return { fieldErrors: result.fieldErrors, formError: result.formError };
  revalidatePath(`/l/${leagueId}`, "layout");
  redirect(`/l/${leagueId}/paris/${result.betId}`);
}

export async function updateBetAction(
  leagueId: string,
  betId: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { user, now } = await prepare(leagueId);
  const result = await orNotFound(() => updateBet(user, leagueId, betId, betInput(form), now));
  if (!result.ok) return { fieldErrors: result.fieldErrors, formError: result.formError };
  revalidatePath(`/l/${leagueId}`, "layout");
  redirect(`/l/${leagueId}/paris/${betId}`);
}

export async function cancelBetAction(leagueId: string, betId: string): Promise<void> {
  const { user, now } = await prepare(leagueId);
  await orNotFound(() => cancelBet(user, leagueId, betId, now));
  revalidatePath(`/l/${leagueId}`, "layout");
}

export async function placeWagerAction(
  leagueId: string,
  betId: string,
  input: { optionId: string; amount: number; ticketId: string },
): Promise<{ error?: string }> {
  const { user, now } = await prepare(leagueId);
  const result = await orNotFound(() => placeWager(user, leagueId, betId, input, now));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/l/${leagueId}`, "layout");
  return {};
}

export async function resultAction(
  leagueId: string,
  betId: string,
  mode: "resolve" | "correct",
  choice: ResultChoice,
): Promise<{ error?: string }> {
  const { user, now } = await prepare(leagueId);
  const run = mode === "resolve" ? resolveBet : correctResult;
  const result = await orNotFound(() => run(user, leagueId, betId, choice, now));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/l/${leagueId}`, "layout");
  return {};
}
