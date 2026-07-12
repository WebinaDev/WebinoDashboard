import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"

import { AppProviders } from "@/providers/AppProviders"
import { QueryProvider } from "@/providers/QueryProvider"

import "./globals.css"

const yekanBakh = localFont({
  src: [
    {
      path: "../public/fonts/yekan-bakh/YekanBakh-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/yekan-bakh/YekanBakh-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-yekan",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
})

export const metadata: Metadata = {
  title: "Webino Dashboard",
  description: "Modular business dashboard",
  icons: { icon: "/favicon.svg" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fa" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/yekan-bakh/YekanBakh-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          fetchPriority="high"
        />
      </head>
      <body className={`${yekanBakh.variable} min-h-svh font-sans`}>
        <QueryProvider>
          <AppProviders>{children}</AppProviders>
        </QueryProvider>
      </body>
    </html>
  )
}
