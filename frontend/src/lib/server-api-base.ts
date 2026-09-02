/** Server/middleware API origin (Docker: INTERNAL_API_URL when public URL is same-origin). */
export function getServerApiBase(): string {
  const publicBase = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (publicBase) {
    return publicBase
  }
  return process.env.INTERNAL_API_URL?.trim() ?? ""
}
