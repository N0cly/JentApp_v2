// Catalogue du super-admin (docs/M6.md, § Catalogue). Chaque fonction vérifie
// elle-même le droit : tout autre compte reçoit une 404, page comme action.

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { achievements, cosmetics, users } from "@/db/schema";
import { describeRule, needsValue, RULE_TYPES, type RuleType } from "@/server/achievements/rules";
import { isUuid } from "@/server/auth/access";
import { deletePhotoFile, saveCosmeticImage } from "@/server/avatars";
import { NotFoundError } from "@/server/errors";

export const catalogMessages = {
  color: "Une couleur s'écrit #RRGGBB.",
  name: "Donne-lui un nom.",
  price: "Un prix est un nombre entier de clopes, 0 ou plus.",
  reward: "Une récompense est un nombre entier de clopes, 0 ou plus.",
  value: "Le seuil est un nombre entier, 1 ou plus.",
  position: "L'ordre est un nombre entier.",
  image: "Ajoute une image.",
} as const;

export type CatalogField = "name" | "price" | "color" | "image" | "position" | "reward" | "value";
export type CatalogResult =
  { ok: true; id: string } | { ok: false; fieldErrors: Partial<Record<CatalogField, string>> };

const COLOR = /^#[0-9A-Fa-f]{6}$/;
const MAX_NAME = 40;

/** 404 si le compte n'est pas super-admin. */
export async function assertSuperAdmin(actor: { id: string }): Promise<void> {
  const [row] = await getDb()
    .select({ ok: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, actor.id));
  if (!row?.ok) throw new NotFoundError();
}

const int = (min: number) => z.coerce.number().int().min(min);

function parseName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

// --- Cosmétiques -------------------------------------------------------------

export type CatalogCosmetic = {
  id: string;
  type: "avatar" | "border";
  name: string;
  imageUrl: string | null;
  tintColor: string | null;
  price: number;
  active: boolean;
  position: number;
};

export type CosmeticInput = {
  name: unknown;
  price: unknown;
  position: unknown;
  /** Bordure. */
  color?: unknown;
  /** Avatar : contenu de l'image, s'il y en a une nouvelle. */
  image?: Uint8Array | null;
};

function validateCosmetic(type: "avatar" | "border", input: CosmeticInput, creating: boolean) {
  const fieldErrors: Partial<Record<CatalogField, string>> = {};
  const name = parseName(input.name);
  if (!name) fieldErrors.name = catalogMessages.name;
  const price = int(0).safeParse(input.price);
  if (!price.success) fieldErrors.price = catalogMessages.price;
  const position = z.coerce
    .number()
    .int()
    .safeParse(input.position ?? 0);
  if (!position.success) fieldErrors.position = catalogMessages.position;
  let tintColor: string | null = null;
  if (type === "border") {
    const color = typeof input.color === "string" ? input.color.trim() : "";
    if (!COLOR.test(color)) fieldErrors.color = catalogMessages.color;
    else tintColor = color.toUpperCase();
  } else if (creating && !input.image?.byteLength) {
    fieldErrors.image = catalogMessages.image;
  }
  return {
    fieldErrors,
    values: {
      name: name ?? "",
      price: price.success ? price.data : 0,
      position: position.success ? position.data : 0,
      tintColor,
    },
  };
}

/** Tout le catalogue, actifs et désactivés, dans l'ordre. */
export async function listCatalog(actor: { id: string }): Promise<{
  cosmetics: CatalogCosmetic[];
  achievements: CatalogAchievement[];
}> {
  await assertSuperAdmin(actor);
  const [c, a] = await Promise.all([
    getDb().select().from(cosmetics).orderBy(asc(cosmetics.position), asc(cosmetics.createdAt)),
    getDb()
      .select()
      .from(achievements)
      .orderBy(asc(achievements.position), asc(achievements.createdAt)),
  ]);
  return {
    cosmetics: c.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      imageUrl: r.imageUrl,
      tintColor: r.tintColor,
      price: r.price,
      active: r.active,
      position: r.position,
    })),
    achievements: a.map(toCatalogAchievement),
  };
}

/** Ajouter un cosmétique : une bordure avec sa couleur, un avatar avec son image. */
export async function createCosmetic(
  actor: { id: string },
  type: unknown,
  input: CosmeticInput,
): Promise<CatalogResult> {
  await assertSuperAdmin(actor);
  if (type !== "avatar" && type !== "border") throw new NotFoundError();
  const { fieldErrors, values } = validateCosmetic(type, input, true);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  let imageUrl: string | null = null;
  if (type === "avatar") {
    const stored = await saveCosmeticImage(input.image!);
    if (!stored.ok) return { ok: false, fieldErrors: { image: stored.error } };
    imageUrl = stored.image;
  }
  const [row] = await getDb()
    .insert(cosmetics)
    .values({ type, ...values, imageUrl })
    .returning({ id: cosmetics.id });
  return { ok: true, id: row!.id };
}

/**
 * Modifier nom, prix, couleur ou image, ordre. Le type ne change pas. Les
 * achats passés gardent leur prix payé.
 */
export async function updateCosmetic(
  actor: { id: string },
  id: string,
  input: CosmeticInput,
): Promise<CatalogResult> {
  await assertSuperAdmin(actor);
  if (!isUuid(id)) throw new NotFoundError();
  const [current] = await getDb().select().from(cosmetics).where(eq(cosmetics.id, id));
  if (!current) throw new NotFoundError();
  const { fieldErrors, values } = validateCosmetic(current.type, input, false);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  let imageUrl = current.imageUrl;
  if (current.type === "avatar" && input.image?.byteLength) {
    const stored = await saveCosmeticImage(input.image);
    if (!stored.ok) return { ok: false, fieldErrors: { image: stored.error } };
    imageUrl = stored.image;
  }
  await getDb()
    .update(cosmetics)
    .set({ ...values, tintColor: current.type === "border" ? values.tintColor : null, imageUrl })
    .where(eq(cosmetics.id, id));
  if (imageUrl !== current.imageUrl) await deletePhotoFile(current.imageUrl);
  return { ok: true, id };
}

/** Activer ou désactiver : un désactivé quitte la boutique, ses détenteurs le gardent. */
export async function setCosmeticActive(actor: { id: string }, id: string, active: boolean) {
  await assertSuperAdmin(actor);
  if (!isUuid(id)) throw new NotFoundError();
  const updated = await getDb()
    .update(cosmetics)
    .set({ active: Boolean(active) })
    .where(eq(cosmetics.id, id))
    .returning({ id: cosmetics.id });
  if (updated.length === 0) throw new NotFoundError();
}

// --- Succès ------------------------------------------------------------------

export type CatalogAchievement = {
  id: string;
  key: string;
  name: string;
  ruleType: RuleType;
  ruleValue: number | null;
  description: string;
  reward: number;
  hidden: boolean;
  active: boolean;
  position: number;
};

function toCatalogAchievement(r: typeof achievements.$inferSelect): CatalogAchievement {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    ruleType: r.ruleType,
    ruleValue: r.ruleValue,
    description: describeRule(r.ruleType, r.ruleValue),
    reward: r.reward,
    hidden: r.hidden,
    active: r.active,
    position: r.position,
  };
}

export type AchievementInput = {
  name: unknown;
  value: unknown;
  reward: unknown;
  hidden: unknown;
  position: unknown;
};

function validateAchievement(rule: RuleType, input: AchievementInput) {
  const fieldErrors: Partial<Record<CatalogField, string>> = {};
  const name = parseName(input.name);
  if (!name) fieldErrors.name = catalogMessages.name;
  const reward = int(0).safeParse(input.reward);
  if (!reward.success) fieldErrors.reward = catalogMessages.reward;
  let ruleValue: number | null = null;
  if (needsValue(rule)) {
    const value = int(1).safeParse(input.value);
    if (!value.success) fieldErrors.value = catalogMessages.value;
    else ruleValue = value.data;
  }
  const position = z.coerce
    .number()
    .int()
    .safeParse(input.position ?? 0);
  if (!position.success) fieldErrors.position = catalogMessages.position;
  return {
    fieldErrors,
    values: {
      name: name ?? "",
      ruleValue,
      reward: reward.success ? reward.data : 0,
      hidden: input.hidden === true || input.hidden === "on" || input.hidden === "true",
      position: position.success ? position.data : 0,
    },
  };
}

/** Clé tirée du nom, unique ; elle ne change plus ensuite. */
async function newKey(name: string): Promise<string> {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "succes";
  const taken = new Set(
    (
      await getDb()
        .select({ key: achievements.key })
        .from(achievements)
        .where(sql`${achievements.key} like ${`${base}%`}`)
    ).map((r) => r.key),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Ajouter un succès : type de règle parmi les huit, seuil, nom, récompense, caché. */
export async function createAchievement(
  actor: { id: string },
  ruleType: unknown,
  input: AchievementInput,
): Promise<CatalogResult> {
  await assertSuperAdmin(actor);
  if (!RULE_TYPES.includes(ruleType as RuleType)) throw new NotFoundError();
  const rule = ruleType as RuleType;
  const { fieldErrors, values } = validateAchievement(rule, input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const [row] = await getDb()
    .insert(achievements)
    .values({ key: await newKey(values.name), ruleType: rule, ...values })
    .returning({ id: achievements.id });
  return { ok: true, id: row!.id };
}

/**
 * Modifier nom, seuil, récompense, caché, ordre. La clé et le type de règle
 * ne changent pas ; les récompenses déjà versées non plus.
 */
export async function updateAchievement(
  actor: { id: string },
  id: string,
  input: AchievementInput,
): Promise<CatalogResult> {
  await assertSuperAdmin(actor);
  if (!isUuid(id)) throw new NotFoundError();
  const [current] = await getDb().select().from(achievements).where(eq(achievements.id, id));
  if (!current) throw new NotFoundError();
  const { fieldErrors, values } = validateAchievement(current.ruleType, input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  await getDb().update(achievements).set(values).where(eq(achievements.id, id));
  return { ok: true, id };
}

/** Activer ou désactiver : un désactivé ne se débloque plus. */
export async function setAchievementActive(actor: { id: string }, id: string, active: boolean) {
  await assertSuperAdmin(actor);
  if (!isUuid(id)) throw new NotFoundError();
  const updated = await getDb()
    .update(achievements)
    .set({ active: Boolean(active) })
    .where(eq(achievements.id, id))
    .returning({ id: achievements.id });
  if (updated.length === 0) throw new NotFoundError();
}
