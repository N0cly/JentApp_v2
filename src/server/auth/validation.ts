import { z } from "zod";

// Messages : docs/M1.md, § Messages.
export const messages = {
  usernameInvalid: "3 à 20 caractères : lettres, chiffres, _ et -.",
  usernameTaken: "Ce pseudo est déjà pris.",
  emailInvalid: "Cet email n'a pas l'air valide.",
  emailTaken: "Un compte existe déjà avec cet email.",
  passwordTooShort: (missing: number) => `8 caractères minimum. Il en manque ${missing}.`,
  termsRequired: "Coche la case pour continuer.",
  signInRefused: "Email ou mot de passe incorrect.",
  signupsClosed: "Les inscriptions sont fermées sur cet environnement.",
  linkExpired: "Ce lien n'est plus valable. Demande-en un nouveau.",
  currentPasswordWrong: "Ce n'est pas ton mot de passe actuel.",
} as const;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/** Lettres (accents admis), chiffres, _ et -, sans espace. */
const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N}_-]{3,20}$/u;

export const usernameSchema = z
  .string()
  .transform((value) => value.trim().normalize("NFC"))
  .refine((value) => USERNAME_PATTERN.test(value), messages.usernameInvalid);

export const emailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email(messages.emailInvalid));

export const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length < PASSWORD_MIN) {
    ctx.addIssue({
      code: "custom",
      message: messages.passwordTooShort(PASSWORD_MIN - value.length),
    });
  } else if (value.length > PASSWORD_MAX) {
    ctx.addIssue({ code: "custom", message: `${PASSWORD_MAX} caractères au plus.` });
  }
});

export const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  terms: z.literal(true, messages.termsRequired),
});

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

/** Première erreur de chaque champ, pour les afficher toutes ensemble. */
export function fieldErrors<K extends string>(error: z.ZodError): FieldErrors<K> {
  const result: FieldErrors<K> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as K | undefined;
    if (key !== undefined && result[key] === undefined) result[key] = issue.message;
  }
  return result;
}
