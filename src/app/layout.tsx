import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${display.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
