import { headers } from "next/headers";
import { getSessionUser } from "@/server/auth";
import { searchGifs } from "@/server/chat";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser(await headers());
  if (!user) return Response.json({ error: "Connecte-toi." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q");
  const result = await searchGifs(user.id, query, new Date());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ gifs: result.gifs }, { headers: { "Cache-Control": "no-store" } });
}
