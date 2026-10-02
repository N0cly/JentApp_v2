import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getAuth } from "./auth";
import { isUsernameTaken, type Result } from "./accounts";
import { emailSchema, fieldErrors, messages, passwordSchema, usernameSchema } from "./validation";

/** Pseudo : mêmes règles qu'à l'inscription. */
export async function changeUsername(userId: string, input: unknown): Promise<Result<"username">> {
  const parsed = z.object({ username: usernameSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const username = parsed.data.username;
  if (await isUsernameTaken(username, userId)) {
    return { ok: false, fieldErrors: { username: messages.usernameTaken } };
  }
  try {
    await getDb().update(users).set({ name: username }).where(eq(users.id, userId));
    return { ok: true };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "23505")
      return { ok: false, fieldErrors: { username: messages.usernameTaken } };
    throw error;
  }
}

/** L'email change après le lien envoyé à la nouvelle adresse. */
export async function requestEmailChange(
  input: unknown,
  headers: Headers,
): Promise<Result<"email">> {
  const parsed = z.object({ email: emailSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const [taken] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email));
  if (taken) return { ok: false, fieldErrors: { email: messages.emailTaken } };
  await getAuth().api.changeEmail({
    body: { newEmail: parsed.data.email, callbackURL: "/" },
    headers,
  });
  return { ok: true };
}

/** Mot de passe actuel et nouveau. Ferme les autres sessions. */
export async function changePassword(
  input: unknown,
  headers: Headers,
): Promise<Result<"currentPassword" | "newPassword">> {
  const parsed = z
    .object({
      currentPassword: z.string().min(1, messages.currentPasswordWrong),
      newPassword: passwordSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    const { headers: responseHeaders } = await getAuth().api.changePassword({
      body: { ...parsed.data, revokeOtherSessions: true },
      headers,
      returnHeaders: true,
    });
    return { ok: true, headers: responseHeaders };
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500) {
      return { ok: false, fieldErrors: { currentPassword: messages.currentPasswordWrong } };
    }
    throw error;
  }
}
