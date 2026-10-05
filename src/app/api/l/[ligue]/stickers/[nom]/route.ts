import { getSessionUser } from "@/server/auth";
import { stickerResponse } from "@/server/stickers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Un sticker du chat, pour les membres de la ligue seulement (docs/STICKERS.md, § Accès). */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/l/[ligue]/stickers/[nom]">,
) {
  const { ligue, nom } = await params;
  return stickerResponse(await getSessionUser(request.headers), ligue, nom);
}
