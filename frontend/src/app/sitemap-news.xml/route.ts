import { getServerApiBase } from "@/lib/server-api-base"

export const revalidate = 300

const FALLBACK = "<?xml version=\"1.0\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>"
const FALLBACK_HEADERS = { "Content-Type": "application/xml; charset=UTF-8" }

export async function GET() {
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return new Response(FALLBACK, { headers: FALLBACK_HEADERS })
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/public/seo/sitemap/news`, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 300 },
    })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "application/xml; charset=UTF-8", "Cache-Control": "public, max-age=300" },
    })
  } catch {
    return new Response(FALLBACK, { headers: FALLBACK_HEADERS })
  }
}
