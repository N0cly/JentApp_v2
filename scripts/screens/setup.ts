// Mise en place de `pnpm test:screens` : une base `<base>_screens` remise à
// neuf, le jeu de données extrême, et un serveur de dev sur le port 3100.

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

export const PORT = 3100;
export const BASE = `http://localhost:${PORT}`;
export const OUTPUT = "screens-output";

async function freshDatabase(url: string): Promise<string> {
  const target = new URL(url);
  const name = `${target.pathname.slice(1)}_screens`;
  target.pathname = `/${name}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.unsafe(`create database "${name}"`);
  await admin.end();
  const client = postgres(target.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
  await client.end();
  return target.toString();
}

async function waitForServer(server: ChildProcess) {
  for (let i = 0; i < 240; i++) {
    if (server.exitCode !== null) throw new Error("Le serveur de dev s'est arrêté");
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le serveur de dev ne répond pas");
}

export default async function setup(project: TestProject) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : lancer `docker compose up -d db`");
  const screensUrl = await freshDatabase(url);
  process.env.DATABASE_URL = screensUrl;
  process.env.APP_URL = BASE;

  const { seedExtreme } = await import("./seed");
  const seeded = await seedExtreme();
  project.provide("seeded", seeded);

  mkdirSync(OUTPUT, { recursive: true });
  const log = createWriteStream(`${OUTPUT}/server.log`);
  const server = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], {
    env: { ...process.env, DATABASE_URL: screensUrl, APP_URL: BASE, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  await waitForServer(server);

  return async () => {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {
      // Déjà arrêté.
    }
    const { getDb } = await import("@/db/client");
    await (getDb() as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    seeded: import("./seed").Seeded;
  }
}
