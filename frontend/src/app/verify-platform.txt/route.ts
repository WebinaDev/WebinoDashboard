import { getServerApiBase, internalApiHeaders } from "@/lib/server-api-base"

export const dynamic = "force-dynamic"

const headers = {
  "Content-Type": "text/plain; charset=UTF-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
}

export async function GET(request: Request) {
  const apiBase = getServerApiBase()
  if (!apiBase) return new Response("", { status: 404, headers })

  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").replace(/:\d+$/, "")
  try {
    const response = await fetch(`${apiBase}/api/v1/public/platform-verification`, {
      headers: {
        Accept: "application/json",
        ...internalApiHeaders(),
        ...(host ? { "X-Tenant-Domain": host } : {}),
      },
      cache: "no-store",
    })
    if (!response.ok) return new Response("", { status: 404, headers })
    const payload = await response.json()
    const code: unknown = payload?.data?.code
    if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(code)) {
      return new Response("", { status: 404, headers })
    }
    return new Response(code, { headers })
  } catch {
    return new Response("", { status: 404, headers })
  }
}
