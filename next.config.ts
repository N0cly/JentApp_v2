import type { NextConfig } from "next";

// Identifiant du build : il nomme le cache du service worker (public/sw.js),
// pour qu'une nouvelle version remplace l'ancienne.
const buildId = process.env.BUILD_ID || Date.now().toString(36);

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // CLAUDE.md appartient au projet : `next dev` ne doit pas y écrire.
  agentRules: false,
  experimental: {
    // Photo de profil : 5 Mo au plus, plus l'enveloppe du formulaire.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Laissés hors du bundle pour être copiés dans l'image : le migrateur
  // (src/db/migrate.ts) s'en sert avant le démarrage de l'app.
  serverExternalPackages: ["drizzle-orm", "postgres"],
  outputFileTracingIncludes: {
    // Pages légales lues depuis le dépôt.
    "/conditions": ["./content/legal/*.md"],
    "/confidentialite": ["./content/legal/*.md"],
    "/mentions-legales": ["./content/legal/*.md"],
    "/api/health": [
      "./node_modules/drizzle-orm/**/*.js",
      "./node_modules/drizzle-orm/package.json",
      "./node_modules/postgres/**/*",
    ],
  },
};

export default nextConfig;
