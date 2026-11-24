import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const body = DM_Sans({ variable: "--font-body", subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"] });
const head = Barlow_Condensed({ variable: "--font-head", subsets: ["latin", "latin-ext"], weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "Réseau · SolveLab",
  description: "Un assistant pour publier sur YouTube, TikTok, LinkedIn et la fiche Google.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Réseau SolveLab", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0710" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const light = (await cookies()).get("theme")?.value === "light"; // par défaut : nuit SolveLab
  return (
    <html lang="fr" className={light ? "" : "dark"}>
      <body className={`${body.variable} ${head.variable} min-h-dvh`}>{children}</body>
    </html>
  );
}
