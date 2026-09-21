import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.CODESPACE_NAME
      ? [`${process.env.CODESPACE_NAME}-3000.app.github.dev`]
      : []),
  ],
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/**": ["./certs/supabase-ca.crt", "./public/logo-rj.png"],
  },
  async headers() {
    return [
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
