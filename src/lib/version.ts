// Version de l'app (docs/VALIDATION.md, B.1) : celle de package.json, figée
// dans l'image au build. `2.x.0` pour une nouveauté visible, `2.x.y` pour une correction.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isVersion(value: string): boolean {
  return SEMVER.test(value);
}

/** Négatif si `a` est plus ancienne que `b`, positif si plus récente, 0 si égales. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`Version invalide : ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
