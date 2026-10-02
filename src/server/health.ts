import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export type Health =
  | { httpStatus: 200; body: { status: "ok"; db: "ok" } }
  | { httpStatus: 503; body: { status: "error"; db: "error" } };

const TIMEOUT_MS = 3000;

/** Interroge la base ; une base muette ou trop lente rend l'app indisponible. */
export async function checkHealth(
  ping: () => Promise<unknown> = () => getDb().execute(sql`select 1`),
  timeoutMs = TIMEOUT_MS,
): Promise<Health> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    await Promise.race([ping(), timeout]);
    return { httpStatus: 200, body: { status: "ok", db: "ok" } };
  } catch {
    return { httpStatus: 503, body: { status: "error", db: "error" } };
  } finally {
    clearTimeout(timer);
  }
}
