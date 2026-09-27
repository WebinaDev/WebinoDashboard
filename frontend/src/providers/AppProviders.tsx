"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

import {
  ACCENT_PRESETS,
  normalizeAccent,
  type AccentPreset,
} from "@/lib/accent"
import { api } from "@/lib/api"

export type Accent = AccentPreset

export const ACCENT_OPTIONS: Accent[] = [...ACCENT_PRESETS]

export type ThemeMode = "light" | "dark" | "system"

type ThemeCtx = {
  mode: ThemeMode
  resolvedMode: "light" | "dark"
  setMode: (m: ThemeMode) => void
  accent: Accent
  setAccent: (a: Accent) => void
  applyServerPreferences: (prefs: {
    theme?: string | null
    accent?: string | null
  }) => void
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

function persistPreferences(patch: { theme?: ThemeMode; accent?: Accent; locale?: string }) {
  void api("/api/v1/account/preferences", { method: "PATCH", json: patch }).catch(() => {
    /* offline / unauthenticated — local storage already updated */
  })
}

function AccentAndAuthProviders({ children }: { children: ReactNode }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [authenticated, setAuthenticated] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [accent, setAccentState] = useState<Accent>("colorful")
  const userAccentOverride = useRef(false)
  const skipPersist = useRef(true)

  const setMode = useCallback(
    (m: ThemeMode) => {
      setTheme(m)
      localStorage.setItem("theme_mode", m)
      if (!skipPersist.current) {
        persistPreferences({ theme: m })
      }
    },
    [setTheme],
  )

  const setAccent = useCallback((a: Accent) => {
    const next = normalizeAccent(a)
    userAccentOverride.current = true
    setAccentState(next)
    localStorage.setItem("theme_accent", next)
    if (!skipPersist.current) {
      persistPreferences({ accent: next })
    }
  }, [])

  const applyServerPreferences = useCallback(
    (prefs: { theme?: string | null; accent?: string | null }) => {
      skipPersist.current = true
      if (prefs.theme === "light" || prefs.theme === "dark" || prefs.theme === "system") {
        setTheme(prefs.theme)
        localStorage.setItem("theme_mode", prefs.theme)
      }
      if (prefs.accent && !userAccentOverride.current) {
        const next = normalizeAccent(prefs.accent)
        setAccentState(next)
        localStorage.setItem("theme_accent", next)
      }
      queueMicrotask(() => {
        skipPersist.current = false
      })
    },
    [setTheme],
  )

  useLayoutEffect(() => {
    const storedAccent = localStorage.getItem("theme_accent")
    if (storedAccent) {
      userAccentOverride.current = true
      setAccentState(normalizeAccent(storedAccent))
    }
    skipPersist.current = false
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    document.documentElement.setAttribute("data-accent", accent)
  }, [hydrated, accent])

  const mode: ThemeMode =
    theme === "dark" || theme === "light" || theme === "system" ? theme : "system"
  const resolvedMode: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light"

  const themeValue = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode,
      accent,
      setAccent,
      applyServerPreferences,
    }),
    [mode, resolvedMode, setMode, accent, setAccent, applyServerPreferences],
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
