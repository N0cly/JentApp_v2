import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// En local, DATABASE_URL vient de .env ; en CI, de l'environnement.
try {
  process.loadEnvFile();
} catch {
  // Pas de .env : rien à charger.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
