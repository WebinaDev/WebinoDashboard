import bundleAnalyzer from "@next/bundle-analyzer"

import { LEGACY_DASHBOARD_REDIRECTS } from "./src/kernel/legacy-redirects.mjs"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const apiProxyTarget =
  process.env.API_PROXY_TARGET ?? "http://localhost:8080"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  // Built-in trailing-slash 308 ran before middleware: /product/x/ → 308 /product/x → 301 /x. Middleware now 301s in one hop.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  transpilePackages: ["@webina/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    // Central optimizer fallback for src/lib/image-url.ts (used when NEXT_PUBLIC_IMG_PROXY_BASE is unset).
    formats: ["image/webp"], // AVIF encode of large logos took ~35s on first hit
    deviceSizes: [400, 800, 1200, 1600],
    imageSizes: [64, 128, 256],
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: false,
    remotePatterns: [
      { protocol: "https", hostname: "**", pathname: "/storage/**" },
      { protocol: "https", hostname: "**", pathname: "/uploads/**" },
      // Imported WordPress media (e.g. parisma.ir/wp-content/uploads/...) — was served raw (≈1MB PNGs).
      { protocol: "https", hostname: "**", pathname: "/wp-content/uploads/**" },
      { protocol: "http", hostname: "**", pathname: "/storage/**" },
      { protocol: "http", hostname: "**", pathname: "/uploads/**" },
    ],
  },
  async redirects() {
    return LEGACY_DASHBOARD_REDIRECTS.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: r.permanent ?? true,
    }))
  },
  async headers() {
    return [
      {
        // Wappalyzer fingerprint (webina_site cookie is set in middleware).
        source: "/:path*",
        headers: [
          { key: "X-Powered-By", value: "Webina Dashboard" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/dashboard/" },
          { key: "Cache-Control", value: "no-cache, must-revalidate, max-age=0" },
          { key: "Content-Type", value: "application/javascript; charset=UTF-8" },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/wp-json/:path*",
        destination: `${apiProxyTarget}/api/v1/public/wp-json/:path*`,
      },
      {
        source: "/webino/digikala-webhook",
        destination: `${apiProxyTarget}/api/v1/public/marketplace/digikala/webhook`,
      },
    ]
  },
}

export default withBundleAnalyzer(nextConfig)
