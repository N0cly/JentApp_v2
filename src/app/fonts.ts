import { Bricolage_Grotesque, DM_Mono } from "next/font/google";

// Texte : variable, avec l'axe de chasse pour les titres en 85 %.
export const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  variable: "--font-display",
  display: "swap",
});

// Chiffres : montants, pots, cotes, comptes à rebours, rangs.
export const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});
