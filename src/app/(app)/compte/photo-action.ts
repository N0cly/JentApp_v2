"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { photoMessages, saveProfilePhoto } from "@/server/avatars";

export type PhotoState = { error?: string };

export async function uploadPhotoAction(_: PhotoState, form: FormData): Promise<PhotoState> {
  const user = await requireUser();
  const file = form.get("photo");
  if (!(file instanceof File)) return { error: photoMessages.badFormat };
  const result = await saveProfilePhoto(user.id, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return {};
}
