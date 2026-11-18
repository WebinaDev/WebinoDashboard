import { getServerApiBase } from "@/lib/server-api-base"

export const revalidate = 300

const FALLBACK = "User-agent: *\nAllow: /\n"
const FALLBACK_HEADERS = { "Content-Type": "text/plain; charset=UTF-8" }

export async function GET() {
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return new Response(FALLBACK, { headers: FALLBACK_HEADERS })
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/public/seo/robots`, {
      headers: { Accept: "text/plain" },
      next: { revalidate: 300 },
    })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "text/plain; charset=UTF-8", "Cache-Control": "public, max-age=300" },
    })
  } catch {
    return new Response(FALLBACK, { headers: FALLBACK_HEADERS })
  }
}
