import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl"

import enMessages from "../../messages/en.json"
import faMessages from "../../messages/fa.json"

import { readRequestLocale } from "@/lib/request-locale"
import { yekanBakh } from "@/lib/fonts/yekan-bakh"
import { htmlDir } from "@/lib/locale"
import { requestPageLang } from "@/builder/page-lang"
import { getApiOrigin } from "@/lib/api-origin"
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
    { media: "(prefers-color-scheme: light)", color: "#fdfbf5" },
    { media: "(prefers-color-scheme: dark)", color: "#041419" },
  ],
}

const messageCatalog = {
  fa: faMessages,
  en: enMessages,
} as const

/** Dashboard-only namespaces never read by storefront/theme code; left out of public pages' HTML. */
const ADMIN_ONLY_NAMESPACES = ["cafe_admin", "reports", "orders_admin", "users_admin", "content_admin", "pos_admin"] as const

function isAdminPath(path: string): boolean {
  return /^\/(dashboard|admin|setup|login|account)(\/|$|\?)/.test(path)
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // A builder page with its own language (e.g. an English page on a Persian site) sets <html lang/dir> and the UI catalogue.
  const pageLang = await requestPageLang()
  const locale = pageLang?.uiLocale ?? (await readRequestLocale())
  const path = (await headers()).get("x-webino-path") ?? ""
  const fullMessages = messageCatalog[locale] as AbstractIntlMessages
  const messages = isAdminPath(path)
    ? fullMessages
    : Object.fromEntries(Object.entries(fullMessages).filter(([k]) => !(ADMIN_ONLY_NAMESPACES as readonly string[]).includes(k)))
  const dir = pageLang?.dir ?? htmlDir(locale)
  const apiOrigin = getApiOrigin()
  // Pass now/timeZone explicitly so NextIntlClientProviderServer never calls
  // getNow/getTimeZone (those require next-intl/plugin + i18n/request.ts, which
  // break Docker standalone).
  const now = new Date()
  const timeZone =
    process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE?.trim() || "Asia/Tehran"

  return (
    <html lang={pageLang?.lang ?? locale} dir={dir} className={yekanBakh.variable} suppressHydrationWarning>
      <head>
        <meta name="generator" content="Webina Dashboard" />
        {/* Only the two weights used above the fold; the rest load on demand via @font-face (display: swap). */}
        <link rel="preload" href="/fonts/yekan-bakh/woff2/YekanBakh-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/yekan-bakh/woff2/YekanBakh-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script
          id="webina-fingerprint"
          dangerouslySetInnerHTML={{
            __html: 'window.__WEBINA__=Object.assign(window.__WEBINA__||window.Webina||{},{product:"dashboard"});window.Webina=window.__WEBINA__',
          }}
        />
        {apiOrigin ? (
          <>
            <link rel="preconnect" href={apiOrigin} />
            <link rel="dns-prefetch" href={apiOrigin} />
          </>
        ) : null}
      </head>
      <body className="min-h-svh font-sans antialiased">
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          now={now}
          timeZone={timeZone}
        >
          <QueryProvider>
            <AppProviders>{children}</AppProviders>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
