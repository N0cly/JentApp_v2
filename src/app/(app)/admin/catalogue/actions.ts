"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import {
  createAchievement,
  createCosmetic,
  setAchievementActive,
  setCosmeticActive,
  updateAchievement,
  updateCosmetic,
  type CatalogResult,
} from "@/server/catalog";
import { NotFoundError } from "@/server/errors";

// Chaque action passe par le module catalogue, qui vérifie le droit
// super-admin : tout autre compte reçoit une 404.

async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

async function imageOf(form: FormData): Promise<Uint8Array | null> {
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/** Ajouter (sans id) ou modifier un cosmétique. */
export async function saveCosmeticAction(form: FormData): Promise<CatalogResult> {
  const user = await requireUser();
  const id = form.get("id");
  const input = {
    name: form.get("name"),
    price: form.get("price"),
    position: form.get("position"),
    color: form.get("color"),
    image: await imageOf(form),
  };
  return orNotFound(() =>
    typeof id === "string" && id
      ? updateCosmetic(user, id, input)
      : createCosmetic(user, form.get("type"), input),
  );
}

/** Ajouter (sans id) ou modifier un succès. */
export async function saveAchievementAction(form: FormData): Promise<CatalogResult> {
  const user = await requireUser();
  const id = form.get("id");
  const input = {
    name: form.get("name"),
    value: form.get("value"),
    reward: form.get("reward"),
    hidden: form.get("hidden"),
    position: form.get("position"),
  };
  return orNotFound(() =>
    typeof id === "string" && id
      ? updateAchievement(user, id, input)
      : createAchievement(user, form.get("ruleType"), input),
  );
}

export async function setCosmeticActiveAction(id: string, active: boolean): Promise<void> {
  const user = await requireUser();
  await orNotFound(() => setCosmeticActive(user, String(id), Boolean(active)));
}

export async function setAchievementActiveAction(id: string, active: boolean): Promise<void> {
  const user = await requireUser();
  await orNotFound(() => setAchievementActive(user, String(id), Boolean(active)));
}
