import type { MetadataRoute } from "next";

/** Permet d'installer le Studio sur l'écran d'accueil du téléphone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Réseau SolveLab",
    short_name: "Réseau SolveLab",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0710",
    theme_color: "#0b0710",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
