import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Portal Técnico RJ",
  applicationName: "Portal Técnico RJ",
  description: "Programação, apontamentos e relatórios técnicos RJ.",
  manifest: "/field-offline/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Portal Técnico RJ" },
};
export default function TechnicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
