/** Espace insécable avant « ? ! : ; », pour que la ponctuation ne passe pas seule à la ligne. */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([?!:;])/g, " $1");
}
