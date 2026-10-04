// Environnement d'exécution (docs/VALIDATION.md, A.1) : `production` par
// défaut, `validation` sur la copie de validation. Lu à l'exécution, jamais
// figé dans le build : la même image sert aux deux.
// Sans alias d'import : les scripts de validation chargent ce fichier avec Node.

export const APP_ENVS = ["production", "validation"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** `APP_ENV` absent ou vide : production. Une autre valeur est une erreur de configuration. */
export function appEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const value = env.APP_ENV?.trim();
  if (!value) return "production";
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new Error(`APP_ENV inconnu : « ${value} » (production ou validation)`);
}

export function isValidation(env: Record<string, string | undefined> = process.env): boolean {
  return appEnv(env) === "validation";
}
