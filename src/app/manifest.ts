import type { MetadataRoute } from "next";
import { colorToken } from "@/lib/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JentApp",
    short_name: "JentApp",
    description: "Les paris de la bande, au comptoir de nuit.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    // Pensée pour le portrait ; l'app reste utilisable si le téléphone tourne quand même.
    orientation: "portrait",
    background_color: colorToken("bg"),
    theme_color: colorToken("bg"),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
