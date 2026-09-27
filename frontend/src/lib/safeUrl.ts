const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export function isSafeContentUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return !trimmed.includes("..")
  }
  try {
    const parsed = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "https://localhost")
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false
    if (parsed.protocol === "mailto:") return true
    return isAllowedRemoteUrl(parsed.href)
  } catch {
    return false
  }
}

export function isAllowedRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://localhost")
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
    const host = parsed.hostname.toLowerCase()
    if (typeof window !== "undefined" && window.location.hostname.toLowerCase() === host) {
      return true
    }
    const allowed = (typeof window !== "undefined" ? window.webinoDashboard?.allowedRemoteHosts ?? [] : []).map((h) =>
      h.toLowerCase(),
    )
    if (parsed.protocol === "http:") {
      return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || host.endsWith(".test")
    }
    return allowed.includes(host)
  } catch {
    return false
  }
}

declare global {
  interface Window {
    webinoDashboard?: { allowedRemoteHosts?: string[] }
  }
}
