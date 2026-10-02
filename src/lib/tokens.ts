import tokens from "../../design/tokens.json";

/** Valeur d'une couleur de design/tokens.json, pour les endroits hors CSS (manifeste, meta). */
export function colorToken(name: string): string {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`Jeton de couleur inconnu : ${name}`);
  return token.value;
}
