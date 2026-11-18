/** Origin derived from `NEXT_PUBLIC_API_URL` for resource hints. */
export function getApiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (!raw) {
    return null
  }
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}
