import type { Metadata } from "next";
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
};
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await initialSessionAccess();
  return (
    <html lang="pt-BR">
      <head>
        <meta name="app-cache-scope" content={access.cacheScope} />
      </head>
      <body>
        <SessionAccessProvider access={access}>
          {children}
        </SessionAccessProvider>
      </body>
    </html>
  );
}
