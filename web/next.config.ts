import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [{ source: "/programacao-os", destination: "/programacao", permanent: true }];
  },
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.CODESPACE_NAME
      ? [`${process.env.CODESPACE_NAME}-3000.app.github.dev`]
      : []),
  ],
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./certs/supabase-ca.crt", "./public/logo-rj.png", "./public/fonts/report/*"],
  },
  async headers() {
    return [
      {source:"/field-offline/sw.js",headers:[{key:"Service-Worker-Allowed",value:"/"},{key:"Cache-Control",value:"no-cache"}]},
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default config;
