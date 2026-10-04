import { NextResponse, type NextRequest } from "next/server";
import { LAST_LEAGUE_COOKIE } from "@/lib/cookies";
import { isValidation } from "@/server/env";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Retient la ligue ouverte. Aucune autorisation ici : chaque page vérifie
// l'appartenance, et `/` revérifie la ligue avant d'y mener.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  // La validation ne doit jamais être indexée (docs/VALIDATION.md, A.5).
  if (isValidation()) response.headers.set("X-Robots-Tag", "noindex");
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

// Toutes les pages et routes, sauf les fichiers statiques du build.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
