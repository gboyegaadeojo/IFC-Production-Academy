import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js's own start-up scripts are inline.
      "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com",
      "font-src 'self' data:",
      "media-src 'self' blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co https://*.ingest.us.sentry.io https://us.i.posthog.com https://us-assets.i.posthog.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Cache Components stays off: on the Workers runtime its staged rendering relies on Node's
  // setTimeout behaviour and every request hangs. CI smoke tests the built Worker to catch this.
  cacheComponents: false,
  experimental: {
    // SOP uploads (up to 10 MB, lib/domain/sops.ts) go through a server action and the proxy.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker is checked for updates on every visit, so fixes reach installed apps.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  async redirects() {
    return [{ source: "/", destination: "/home", permanent: false }];
  },
};

export default nextConfig;
