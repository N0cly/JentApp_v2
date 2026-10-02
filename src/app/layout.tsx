import type { Metadata } from "next";
import { display, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "JentApp",
  description: "Les paris de la bande, au comptoir de nuit.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
