import { randomInt } from "node:crypto";
import { z } from "zod";

export const MAX_LEAGUES_PER_USER = 10;
export const MAX_MEMBERS_PER_LEAGUE = 50;

// Messages : docs/M1.md, § Messages, et voix de docs/design.md pour les autres.
export const leagueMessages = {
  codeUnknown: "Ce code ne correspond à aucune ligue.",
  leagueFull: "Cette ligue est complète : 50 membres.",
  tooManyLeagues: "Tu es déjà dans 10 ligues. Quittes-en une pour en rejoindre une autre.",
  nameLength: "2 à 30 caractères.",
  joinGrantRange: "Un nombre entier entre 0 et 200.",
  weeklyGrantRange: "Un nombre entier entre 0 et 50.",
  seedAmountRange: "Un nombre entier entre 0 et 20.",
  ownerMustTransfer: "Transfère la ligue avant de la quitter.",
  deleteConfirm: "Écris le nom exact de la ligue pour confirmer.",
} as const;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** Code d'invitation : 6 caractères tirés avec `crypto`. */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Saisie insensible à la casse, espaces ignorés. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/\s+/g, "").toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
    ? code
    : null;
}

const integer = (min: number, max: number, message: string) =>
  z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

export const leagueNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .refine((v) => v.length >= 2 && v.length <= 30, leagueMessages.nameLength);

export const createLeagueSchema = z.object({
  name: leagueNameSchema,
  joinGrant: integer(0, 200, leagueMessages.joinGrantRange),
  weeklyGrant: integer(0, 50, leagueMessages.weeklyGrantRange),
  seedAmount: integer(0, 20, leagueMessages.seedAmountRange),
});
