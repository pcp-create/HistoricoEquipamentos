import type { Metadata, Viewport } from "next";
import { initialSessionAccess } from "@/lib/initial-access";
import { SessionAccessProvider } from "@/components/session-access";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "RJ Compressores | Gestão integrada",
  description:
    "CRM, assistência técnica, suprimentos e gestão de equipamentos.",
  robots: { index: false, follow: false },
  applicationName: "Gestão Integrada",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "RJ Compressores | Gestão integrada",
    description: "CRM, assistência técnica, suprimentos e gestão de equipamentos.",
    siteName: "Gestão Integrada",
    images: [{
      url: "https://rjcompressores.app/icons/gestao-integrada-512.png",
      width: 512,
      height: 512,
      type: "image/png",
      alt: "Gestão Integrada — RJ Compressores",
    }],
  },
  icons: {
    icon: [
      { url: "/icons/gestao-integrada-rounded-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/gestao-integrada-rounded-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/gestao-integrada-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Gestão Integrada", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#183554" };
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await initialSessionAccess();
  return (
    <html lang="pt-BR">
      <head>
        <meta name="app-cache-scope" content={access.cacheScope} />
      </head>
      <body className={access.admin ? "admin-preview" : undefined}>
        <SessionAccessProvider access={access}>
          {children}
        </SessionAccessProvider>
      </body>
    </html>
  );
}
