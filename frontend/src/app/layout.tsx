import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { NextIntlClientProvider } from "next-intl"

import enMessages from "../../messages/en.json"
import faMessages from "../../messages/fa.json"

import { defaultLocale, isLocale, type Locale } from "../../i18n"
import { yekanBakh } from "@/lib/fonts/yekan-bakh"
import { htmlDir } from "@/lib/locale"
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

const messageCatalog = {
  fa: faMessages,
  en: enMessages,
} as const

async function resolveLocale(): Promise<Locale> {
  const jar = await cookies()
  const value = jar.get("NEXT_LOCALE")?.value ?? jar.get("locale")?.value
  return value && isLocale(value) ? value : defaultLocale
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await resolveLocale()
  const messages = messageCatalog[locale]
  const dir = htmlDir(locale)
  const apiOrigin = getApiOrigin()
  // Pass now/timeZone explicitly so NextIntlClientProviderServer never calls
  // getNow/getTimeZone (those require next-intl/plugin + i18n/request.ts, which
  // break Docker standalone).
  const now = new Date()
  const timeZone =
    process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE?.trim() || "Asia/Tehran"

  return (
    <html lang={locale} dir={dir} className={yekanBakh.variable} suppressHydrationWarning>
      <head>
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
