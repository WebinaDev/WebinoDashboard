"use client"

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { I18nextProvider } from "react-i18next"

import i18n from "@/i18n"

type ThemeMode = "light" | "dark"
export type Accent =
  | "zinc"
  | "slate"
  | "blue"
  | "green"
  | "rose"
  | "orange"

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
  token: string | null
  setToken: (t: string | null) => void
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

export function AppProviders({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const setToken = useCallback((t: string | null) => {
    setTokenState(t)
    if (typeof window === "undefined") {
      return
    }
    if (t) {
      localStorage.setItem("auth_token", t)
    } else {
      localStorage.removeItem("auth_token")
    }
  }, [])

  const [mode, setMode] = useState<ThemeMode>("light")
  const [accent, setAccent] = useState<Accent>("zinc")

  useLayoutEffect(() => {
    setTokenState(localStorage.getItem("auth_token"))
    const storedMode = localStorage.getItem("theme_mode") as ThemeMode | null
    if (storedMode === "light" || storedMode === "dark") {
      setMode(storedMode)
    } else {
      setMode(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      )
    }
    const storedAccent = localStorage.getItem("theme_accent") as Accent | null
    if (
      storedAccent &&
      ["zinc", "slate", "blue", "green", "rose", "orange"].includes(
        storedAccent,
      )
    ) {
      setAccent(storedAccent)
    }
    const locale = readStoredLocale()
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr"
    setHydrated(true)
  }, [])

  useLayoutEffect(() => {
    if (!hydrated) {
      return
    }
    localStorage.setItem("theme_mode", mode)
    document.documentElement.classList.toggle("dark", mode === "dark")
  }, [hydrated, mode])

  useLayoutEffect(() => {
    if (!hydrated) {
      return
    }
    localStorage.setItem("theme_accent", accent)
    document.body.className = `theme-${accent} min-h-svh bg-background text-foreground font-sans antialiased`
  }, [hydrated, accent])

  const themeValue = useMemo(
    () => ({
      mode,
      setMode,
      accent,
      setAccent,
    }),
    [mode, accent],
  )

  const authValue = useMemo(() => ({ token, setToken }), [token, setToken])

  if (!hydrated) {
    return null
  }

  return (
    <I18nextProvider i18n={i18n}>
      <AuthContext.Provider value={authValue}>
        <ThemeContext.Provider value={themeValue}>
          {children}
        </ThemeContext.Provider>
      </AuthContext.Provider>
    </I18nextProvider>
  )
}
