import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // librairies mail (IMAP/SMTP) : chargées telles quelles côté serveur
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser"],
};

export default nextConfig;
