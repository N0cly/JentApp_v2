import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LAST_LEAGUE_COOKIE } from "@/lib/cookies";
import { getSessionUser, homePath } from "@/server/auth";

export default async function Home() {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/connexion");
  const lastLeague = (await cookies()).get(LAST_LEAGUE_COOKIE)?.value;
  redirect(await homePath(user.id, lastLeague));
}
