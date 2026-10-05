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
  reactStrictMode: true,
  transpilePackages: ["@webina/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
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
