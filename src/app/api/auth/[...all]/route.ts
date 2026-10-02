import { getAuth } from "@/server/auth";

// Seuls les liens des emails passent par ici. Tout le reste (inscription,
// connexion…) passe par les actions serveur, qui valident et limitent.
const ALLOWED = [/^\/api\/auth\/verify-email$/, /^\/api\/auth\/reset-password\/[^/]+$/];

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!ALLOWED.some((pattern) => pattern.test(pathname))) {
    return new Response("Not found", { status: 404 });
  }
  return getAuth().handler(request);
}
