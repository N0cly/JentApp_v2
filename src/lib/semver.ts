// Numéros de version x.y.z. Sans alias d'import ni JSON : les scripts lancés
// avec Node (aperçu des nouveautés) chargent ce fichier directement.

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
