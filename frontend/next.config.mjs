import bundleAnalyzer from "@next/bundle-analyzer"
import createNextIntlPlugin from "next-intl/plugin"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ]
  },
}

export default withBundleAnalyzer(withNextIntl(nextConfig))
