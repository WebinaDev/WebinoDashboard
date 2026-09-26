/** Server/middleware API origin. Never return a relative `/api` — Edge fetch needs an absolute URL. */
export function getServerApiBase(): string {
  const internal = process.env.INTERNAL_API_URL?.trim()
  if (internal && /^https?:\/\//i.test(internal)) {
    return stripApiSuffix(internal)
  }

  const publicBase = process.env.NEXT_PUBLIC_API_URL?.trim() ?? ""
  if (/^https?:\/\//i.test(publicBase)) {
    return stripApiSuffix(publicBase)
  }

  return ""
}

function stripApiSuffix(value: string): string {
  return value.replace(/\/$/, "").replace(/\/api$/i, "")
}
