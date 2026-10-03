import { z } from "zod";

// Messages : docs/M3.md, § Messages ; voix de docs/design.md pour les autres.
export const betMessages = {
  insufficient: (missing: number) => `Il te manque ${missing} ${missing > 1 ? "clopes" : "clope"}.`,
  closed: "Trop tard, le pari vient de fermer.",
  cap: "Tu as déjà 3 paris en cours. Attends que l'un d'eux soit réglé.",
  question: "Pose une question de 5 à 140 caractères.",
  tooFewOptions: "Il faut au moins 2 options.",
  tooManyOptions: "8 options au plus.",
  optionLength: "Une option fait de 1 à 40 caractères.",
  duplicateOptions: "Deux options portent le même nom.",
  dates: "La fermeture doit venir après l'ouverture.",
  tooFar: "La fermeture doit venir dans les 30 jours.",
  mystery: "Un pari mystère doit s'ouvrir plus tard.",
  tooLateToCorrect: "Trop tard, les gains sont versés.",
  notOpen: "Ce pari n'est pas ouvert aux mises.",
  otherOption: "Tu as déjà misé sur une autre option.",
  amount: "Mise un nombre entier de clopes, 1 au moins.",
  locked: "On ne modifie plus un pari dès la première mise.",
  notClosed: "Le résultat se saisit une fois le pari fermé.",
} as const;

export const MOMENTS = ["BEFORE", "NIGHT", "AFTER", "DAILY", "SPECIAL"] as const;
export type Moment = (typeof MOMENTS)[number];

export const PLAYER_BET_CAP = 3;
const MIN_DURATION_MS = 60 * 1000;
const MAX_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export const SETTLE_DELAY_DEFAULT = 600;

/** Délai entre la saisie du résultat et le versement, en millisecondes. */
export function settleDelayMs(): number {
  const seconds = Number(process.env.SETTLE_DELAY_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : SETTLE_DELAY_DEFAULT) * 1000;
}

export const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : new Date(v)));

const betInputSchema = z.object({
  question: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .refine((v) => v.length >= 5 && v.length <= 140, betMessages.question),
  options: z
    .array(z.string())
    .transform((list) =>
      list.map((o) => o.trim().replace(/\s+/g, " ")).filter((o) => o.length > 0),
    ),
  moment: z.enum(MOMENTS, betMessages.question),
  opensAt: optionalDate,
  closesAt: optionalDate,
  hiddenUntilOpen: z.boolean().default(false),
});

export type BetInput = {
  question: string;
  options: string[];
  moment: Moment;
  opensAt: Date;
  closesAt: Date;
  hiddenUntilOpen: boolean;
};

export type BetField =
  "question" | "options" | "moment" | "opensAt" | "closesAt" | "hiddenUntilOpen";

/**
 * Valide un pari. `createdAt` borne la fermeture à 30 jours ; une ouverture
 * absente ou passée vaut maintenant.
 */
export function validateBet(
  input: unknown,
  now: Date,
  createdAt: Date = now,
): { ok: true; bet: BetInput } | { ok: false; fieldErrors: Partial<Record<BetField, string>> } {
  const parsed = betInputSchema.safeParse(input);
  const errors: Partial<Record<BetField, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as BetField;
      errors[key] ??= key === "moment" ? "Choisis un moment." : issue.message;
    }
    return { ok: false, fieldErrors: errors };
  }
  const { question, options, moment, hiddenUntilOpen } = parsed.data;

  if (options.length < 2) errors.options = betMessages.tooFewOptions;
  else if (options.length > 8) errors.options = betMessages.tooManyOptions;
  else if (options.some((o) => o.length > 40)) errors.options = betMessages.optionLength;
  else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    errors.options = betMessages.duplicateOptions;
  }

  const opensAt = parsed.data.opensAt && parsed.data.opensAt > now ? parsed.data.opensAt : now;
  const closesAt = parsed.data.closesAt;
  if (parsed.data.opensAt && Number.isNaN(parsed.data.opensAt.getTime()))
    errors.opensAt = betMessages.dates;
  if (!closesAt || Number.isNaN(closesAt.getTime())) errors.closesAt = betMessages.dates;
  else if (closesAt.getTime() < opensAt.getTime() + MIN_DURATION_MS)
    errors.closesAt = betMessages.dates;
  else if (closesAt.getTime() > createdAt.getTime() + MAX_HORIZON_MS)
    errors.closesAt = betMessages.tooFar;

  if (hiddenUntilOpen && !(parsed.data.opensAt && parsed.data.opensAt > now)) {
    errors.hiddenUntilOpen = betMessages.mystery;
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    bet: { question, options, moment, opensAt, closesAt: closesAt!, hiddenUntilOpen },
  };
}
