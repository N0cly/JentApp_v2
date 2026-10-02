import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

/** Les écrans de connexion n'ont pas de sens avec une session ouverte. */
export async function redirectIfSignedIn(next: string | null) {
  if (await getSessionUser(await headers())) redirect(next ?? "/");
}
