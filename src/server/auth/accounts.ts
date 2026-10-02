import { and, eq, isNull, sql } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import {
  assertAllowed,
  clientIp,
  consume,
  RateLimitedError,
  record,
  rules,
} from "@/server/rate-limit";
import { getAuth } from "./auth";
import {
  emailSchema,
  fieldErrors,
  messages,
  passwordSchema,
  signUpSchema,
  type FieldErrors,
} from "./validation";

export type Result<F extends string = string> =
  | { ok: true; headers?: Headers }
  | { ok: false; fieldErrors?: FieldErrors<F>; formError?: string; status?: 429 };

/** Une limite atteinte devient un message de formulaire, statut 429. */
async function limited<R>(
  run: () => Promise<R>,
): Promise<R | { ok: false; formError: string; status: 429 }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, formError: error.message, status: 429 };
    }
    throw error;
  }
}

/** Après une confirmation d'email, le lien ramène à l'accueil. */
const VERIFY_CALLBACK = "/";
export const RESET_PAGE = "/nouveau-mot-de-passe";

export async function isUsernameTaken(username: string, exceptUserId?: string) {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.name}) = lower(${username})`);
  return row !== undefined && row.id !== exceptUserId;
}

async function isEmailTaken(email: string) {
  const [row] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email));
  return row !== undefined;
}

function isUniqueViolation(error: unknown, constraint: string) {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } })?.cause ?? error;
  const e = cause as { code?: string; constraint_name?: string };
  return e.code === "23505" && e.constraint_name === constraint;
}

type SignUpField = "username" | "email" | "password" | "terms";

export async function signUp(
  input: unknown,
  headers: Headers,
  now: Date,
): Promise<Result<SignUpField>> {
  return limited(() => signUpUnlimited(input, headers, now));
}

async function signUpUnlimited(
  input: unknown,
  headers: Headers,
  now: Date,
): Promise<Result<SignUpField>> {
  const ip = clientIp(headers);
  await assertAllowed(rules.signUpIp, ip, now);

  const parsed = signUpSchema.safeParse(input);
  const errors: FieldErrors<SignUpField> = parsed.success ? {} : fieldErrors(parsed.error);

  // Pseudo et email pris : signalés avec les autres erreurs, en une fois.
  const raw = z.object({ username: z.string(), email: z.string() }).safeParse(input);
  if (raw.success) {
    const username = raw.data.username.trim().normalize("NFC");
    const email = raw.data.email.trim().toLowerCase();
    if (!errors.username && (await isUsernameTaken(username)))
      errors.username = messages.usernameTaken;
    if (!errors.email && (await isEmailTaken(email))) errors.email = messages.emailTaken;
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  const { username, email, password } = parsed.data;
  try {
    const { headers: responseHeaders } = await getAuth().api.signUpEmail({
      body: { name: username, email, password, callbackURL: VERIFY_CALLBACK },
      headers,
      returnHeaders: true,
    });
    await record(rules.signUpIp, ip, now);
    return { ok: true, headers: responseHeaders };
  } catch (error) {
    // Course entre deux inscriptions : l'index unique tranche.
    if (isUniqueViolation(error, "users_username_lower_idx")) {
      return { ok: false, fieldErrors: { username: messages.usernameTaken } };
    }
    if (isAPIError(error) && error.statusCode === 422) {
      return { ok: false, fieldErrors: { email: messages.emailTaken } };
    }
    throw error;
  }
}

export async function signIn(
  input: unknown,
  headers: Headers,
  now: Date,
): Promise<Result<"email" | "password">> {
  return limited(async () => {
    const parsed = z.object({ email: z.string(), password: z.string() }).safeParse(input);
    if (!parsed.success) return { ok: false, formError: messages.signInRefused } as const;
    const email = parsed.data.email.trim().toLowerCase();
    const ip = clientIp(headers);
    await assertAllowed(rules.loginEmail, email, now);
    await assertAllowed(rules.loginIp, ip, now);
    try {
      const { headers: responseHeaders } = await getAuth().api.signInEmail({
        body: { email, password: parsed.data.password },
        headers,
        returnHeaders: true,
      });
      return { ok: true, headers: responseHeaders } as const;
    } catch (error) {
      if (!isAPIError(error) || error.statusCode >= 500) throw error;
      // Seuls les échecs comptent. Jamais lequel des deux est faux.
      await record(rules.loginEmail, email, now);
      await record(rules.loginIp, ip, now);
      return { ok: false, formError: messages.signInRefused } as const;
    }
  });
}

export async function signOut(headers: Headers) {
  await getAuth().api.signOut({ headers });
}

/** Même réponse que l'email existe ou non. */
export async function requestPasswordReset(
  input: unknown,
  headers: Headers,
  now: Date,
): Promise<Result<"email">> {
  const parsed = z.object({ email: emailSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  return limited(async () => {
    await consume(rules.resetEmail, parsed.data.email, now);
    await getAuth().api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: RESET_PAGE },
      headers,
    });
    return { ok: true } as const;
  });
}

export async function resetPassword(input: unknown): Promise<Result<"password">> {
  const parsed = z.object({ token: z.string().min(1), password: passwordSchema }).safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors<"password" | "token">(parsed.error);
    if (errors.token) return { ok: false, formError: messages.linkExpired };
    return { ok: false, fieldErrors: { password: errors.password } };
  }
  try {
    await getAuth().api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
    });
    return { ok: true };
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500)
      return { ok: false, formError: messages.linkExpired };
    throw error;
  }
}

export async function resendVerification(
  user: { id: string; email: string },
  now: Date,
): Promise<Result> {
  return limited(async () => {
    await consume(rules.resendVerification, user.id, now);
    await getAuth().api.sendVerificationEmail({
      body: { email: user.email, callbackURL: VERIFY_CALLBACK },
    });
    return { ok: true } as const;
  });
}

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

/** Utilisateur de la session, ou null. Un compte supprimé n'a plus de session. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const [user] = await getDb()
    .select({
      id: users.id,
      username: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
    })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)));
  if (!user || !user.username) return null;
  return { ...user, username: user.username };
}
