// Unités d'affichage : 1 joint = 5 clopes, 1 paquet = 20 clopes.

export type Unit = "paquet" | "joint" | "clope";

export const UNIT_SIZE: Record<Unit, number> = { paquet: 20, joint: 5, clope: 1 };

const names: Record<Unit, [string, string]> = {
  paquet: ["paquet", "paquets"],
  joint: ["joint", "joints"],
  clope: ["clope", "clopes"],
};

export type UnitPart = { unit: Unit; count: number; label: string };

/**
 * Décomposition d'un solde : paquets, puis joints, puis clopes. Une unité à
 * zéro est omise ; sous 5 clopes, rien (64 → « 3 paquets · 4 clopes »).
 */
export function breakdown(clopes: number): UnitPart[] {
  if (!Number.isInteger(clopes) || clopes < UNIT_SIZE.joint) return [];
  let rest = clopes;
  const parts: UnitPart[] = [];
  for (const unit of ["paquet", "joint", "clope"] as const) {
    const count = Math.floor(rest / UNIT_SIZE[unit]);
    rest -= count * UNIT_SIZE[unit];
    if (count > 0) parts.push({ unit, count, label: `${count} ${names[unit][count > 1 ? 1 : 0]}` });
  }
  return parts;
}

/** « 1 clope », « 21 clopes » ; zéro reste au singulier. */
export function countOf(n: number, unit: Unit = "clope"): string {
  return `${n} ${names[unit][Math.abs(n) > 1 ? 1 : 0]}`;
}
