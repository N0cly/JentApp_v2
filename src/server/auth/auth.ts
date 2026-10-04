import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { confirmationEmail, resetPasswordEmail, sendEmail } from "@/server/email";
import { signupsClosed } from "@/server/env";
import { messages } from "./validation";

const DAY = 60 * 60 * 24;

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL manquante");
  return url;
}

function deliver(promise: Promise<void>) {
  // Pas d'attente : le temps de réponse ne doit pas dire si le compte existe.
  promise.catch((error) => console.error("Échec d'envoi d'email", error));
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET manquant");

  return betterAuth({
    appName: "JentApp",
    baseURL: appUrl(),
    secret,
    trustedOrigins: [appUrl()],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      usePlural: true,
      schema,
    }),
    advanced: {
      // Identifiants générés par Postgres (uuid).
      database: { generateId: false },
    },
    // Limites de tentatives : src/server/rate-limit, avec les règles de la spec.
    rateLimit: { enabled: false },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
    },
    user: {
      // Le nouvel email ne remplace l'ancien qu'après le lien de confirmation,
      // envoyé à la nouvelle adresse (même email que la confirmation).
      changeEmail: { enabled: true },
      additionalFields: {
        isSuperAdmin: { type: "boolean", input: false, returned: false, defaultValue: false },
        termsAcceptedAt: { type: "date", input: false, returned: false, required: false },
        deletedAt: { type: "date", input: false, returned: false, required: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Le compte est utilisable tout de suite, confirmé ou non.
      requireEmailVerification: false,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        deliver(sendEmail(user.email, resetPasswordEmail({ pseudo: user.name, link: url })));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => {
        deliver(sendEmail(user.email, confirmationEmail({ pseudo: user.name, link: url })));
      },
    },
    databaseHooks: {
      user: {
        create: {
          // L'inscription n'est acceptée qu'avec la case cochée (vérifiée avant l'appel).
          // Inscriptions fermées : refusé ici, quel que soit le chemin d'appel.
          before: async (user) => {
            if (signupsClosed())
              throw new APIError("FORBIDDEN", { message: messages.signupsClosed });
            return { data: { ...user, termsAcceptedAt: new Date() } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Instance créée à la demande : le build n'a pas besoin de la base. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
