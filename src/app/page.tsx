import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LAST_LEAGUE_COOKIE } from "@/lib/cookies";
import { getSessionUser, homePath } from "@/server/auth";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/connexion");
  const lastLeague = (await cookies()).get(LAST_LEAGUE_COOKIE)?.value;
  const path = await homePath(user.id, lastLeague);
  // Lien de confirmation expiré : Better Auth revient ici avec ?error=.
  const expired = (await searchParams).error !== undefined && !user.emailVerified;
  redirect(expired ? `${path}?lien=expire` : path);
}
