// Journal des erreurs serveur (docs/PROD.md, A.4) : une ligne JSON par erreur,
// avec l'heure, la route et l'identifiant du joueur. Jamais d'email ni de cookie.

import { scrubText } from "@/lib/error-report";

type Where = { route: string | null; method: string | null; userId: string | null; now: Date };

/** La ligne d'une erreur, sur une seule ligne. Pure. */
export function formatErrorLine(error: unknown, where: Where): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = (err as Error & { digest?: string }).digest;
  return JSON.stringify({
    time: where.now.toISOString(),
    level: "error",
    route: where.route,
    method: where.method,
    user: where.userId,
    message: scrubText(err.message),
    ...(digest ? { digest } : {}),
    stack: err.stack
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("at "))
      .slice(0, 7),
  });
}

/** Erreurs déjà écrites avec leur route : la sortie de Next ne les répète pas. */
const written = new WeakSet<object>();

export function writeErrorLine(error: unknown, where: Where) {
  if (error && typeof error === "object") written.add(error);
  process.stderr.write(`${formatErrorLine(error, where)}\n`);
}

export function alreadyWritten(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && written.has(error));
}

/** Identifiant du joueur de la requête, par son cookie de session ; null sinon. */
async function userIdOf(headers: Record<string, string | string[] | undefined>) {
  try {
    const list = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) list.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const { getSessionUser } = await import("@/server/auth/accounts");
    return (await getSessionUser(list))?.id ?? null;
  } catch {
    // Base injoignable, session illisible : l'erreur s'écrit quand même.
    return null;
  }
}

/** Une erreur de rendu, de route ou d'action (crochet `onRequestError` de Next). */
export async function logRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string },
) {
  writeErrorLine(error, {
    route: context.routePath || request.path.split("?")[0] || null,
    method: request.method,
    userId: await userIdOf(request.headers),
    now: new Date(),
  });
}
