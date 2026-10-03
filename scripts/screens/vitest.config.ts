import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `pnpm test:screens` : hors de `pnpm test` et de la CI (docs/ECRANS.md).
try {
  process.loadEnvFile();
} catch {
  // Pas de .env : rien à charger.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    include: ["scripts/screens/screens.run.ts"],
    environment: "node",
    globalSetup: ["scripts/screens/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
