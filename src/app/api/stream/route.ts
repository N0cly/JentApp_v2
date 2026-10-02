import { getSessionUser, isUuid } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { openStream, STREAM_HEADERS } from "@/server/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Flux SSE d'une ligue : des signaux, que le client relit par le chemin normal. */
export async function GET(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const leagueId = new URL(request.url).searchParams.get("ligue") ?? "";
  if (!isUuid(leagueId)) return new Response("Not found", { status: 404 });
  try {
    const { stream } = await openStream(user.id, leagueId, request.signal);
    return new Response(stream, { headers: STREAM_HEADERS });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
