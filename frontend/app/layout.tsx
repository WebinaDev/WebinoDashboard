import type { Metadata, Viewport } from "next"

import { yekanBakh } from "@/lib/fonts/yekan-bakh"
import { AppProviders } from "@/providers/AppProviders"
import { QueryProvider } from "@/providers/QueryProvider"

import "./globals.css"

export const metadata: Metadata = {
  title: "Webino Dashboard",
  description: "Modular business dashboard",
  icons: {
    icon: [{ url: "/brand/favicon.png", type: "image/png" }],
    apple: "/brand/apple-touch-icon.png",
  },
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
      <body className={`${yekanBakh.variable} min-h-svh font-sans`}>
        <QueryProvider>
          <AppProviders>{children}</AppProviders>
        </QueryProvider>
      </body>
    </html>
  )
}
