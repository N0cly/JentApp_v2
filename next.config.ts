import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // CLAUDE.md appartient au projet : `next dev` ne doit pas y écrire.
  agentRules: false,
  // Laissés hors du bundle pour être copiés dans l'image : le migrateur
  // (src/db/migrate.ts) s'en sert avant le démarrage de l'app.
  serverExternalPackages: ["drizzle-orm", "postgres"],
  outputFileTracingIncludes: {
    "/api/health": [
      "./node_modules/drizzle-orm/**/*.js",
      "./node_modules/drizzle-orm/package.json",
      "./node_modules/postgres/**/*",
    ],
  },
};

export default nextConfig;
