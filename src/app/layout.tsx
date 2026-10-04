import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { EnvBanner } from "@/components/env/EnvBanner";
import { ErrorReporting } from "@/components/monitoring/ErrorReporting";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { colorToken } from "@/lib/tokens";
import { display, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "JentApp",
  description: "Les paris de la bande, au comptoir de nuit.",
};

export const viewport: Viewport = {
  themeColor: colorToken("bg"),
  viewportFit: "cover",
  // Android réduit la page au-dessus du clavier : la saisie et les boutons restent visibles.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Rendu à chaque requête : APP_ENV et ERROR_DSN se lisent à l'exécution, jamais
  // figés dans le build, la même image servant à la validation et à la production.
  await connection();
  return (
    <html lang="fr" className={`${display.variable} ${mono.variable}`}>
      <body>
        <EnvBanner />
        {children}
        <ServiceWorker />
        <ErrorReporting dsn={process.env.ERROR_DSN?.trim() || null} />
      </body>
    </html>
  );
}
