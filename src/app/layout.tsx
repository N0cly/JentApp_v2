import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JentApp",
  description: "Les paris de la bande, au comptoir de nuit.",
};

import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
