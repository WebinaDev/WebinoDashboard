"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

import { htmlDir, normalizeUiLocale } from "@/lib/locale"

export type Accent =
  | "zinc"
  | "slate"
  | "blue"
  | "green"
  | "rose"
  | "orange"

type ThemeMode = "light" | "dark"

type ThemeCtx = {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  accent: Accent
  setAccent: (a: Accent) => void
}

const ThemeContext = createContext<ThemeCtx | null>(null)

export function useThemeSettings() {
  const v = useContext(ThemeContext)
  if (!v) {
    throw new Error("ThemeContext missing")
  }
  return v
}

type AuthCtx = {
  authenticated: boolean
  setAuthenticated: (v: boolean) => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) {
    throw new Error("AuthContext missing")
  }
  return v
}

function readStoredLocale(): string {
  if (typeof window === "undefined") {
    return "fa"
  }
  return localStorage.getItem("locale") ?? "fa"
}

function AccentAndAuthProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [authenticated, setAuthenticated] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [accent, setAccent] = useState<Accent>("zinc")

  const setMode = useCallback(
    (m: ThemeMode) => {
      setTheme(m)
      localStorage.setItem("theme_mode", m)
    },
    [setTheme],
  )

  useLayoutEffect(() => {
    const storedAccent = localStorage.getItem("theme_accent") as Accent | null
    if (
      storedAccent &&
      ["zinc", "slate", "blue", "green", "rose", "orange"].includes(storedAccent)
    ) {
      setAccent(storedAccent)
    }
    const locale = normalizeUiLocale(readStoredLocale())
    document.documentElement.lang = locale
    document.documentElement.dir = htmlDir(locale)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    localStorage.setItem("theme_accent", accent)
    document.documentElement.setAttribute("data-accent", accent)
  }, [hydrated, accent])

  const mode: ThemeMode = resolvedTheme === "dark" ? "dark" : "light"

  const themeValue = useMemo(
    () => ({
      mode,
      setMode,
      accent,
      setAccent,
    }),
    [mode, setMode, accent],
  )

  const authValue = useMemo(() => ({ authenticated, setAuthenticated }), [authenticated])

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
    </AuthContext.Provider>
  )
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme_mode"
    >
      <AccentAndAuthProviders>{children}</AccentAndAuthProviders>
    </NextThemesProvider>
  )
}
