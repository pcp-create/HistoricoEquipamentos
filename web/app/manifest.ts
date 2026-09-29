import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RJ Compressores | Gestão Integrada",
    short_name: "Gestão Integrada",
    description: "CRM, assistência técnica, suprimentos e gestão de equipamentos.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#183554",
    theme_color: "#183554",
    icons: [
      { src: "/icons/gestao-integrada-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/gestao-integrada-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
