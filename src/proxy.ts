import { NextResponse, type NextRequest } from "next/server";
import { LAST_LEAGUE_COOKIE } from "@/lib/cookies";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Retient la ligue ouverte. Aucune autorisation ici : chaque page vérifie
// l'appartenance, et `/` revérifie la ligue avant d'y mener.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const league = request.nextUrl.pathname.split("/")[2];
  if (league && UUID.test(league)) {
    response.cookies.set(LAST_LEAGUE_COOKIE, league, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:" || process.env.APP_URL?.startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = { matcher: ["/l/:league/:path*"] };
