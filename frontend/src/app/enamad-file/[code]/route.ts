import { getServerApiBase, internalApiHeaders } from "@/lib/server-api-base"

export const dynamic = "force-dynamic"

const PLAIN = { "Content-Type": "text/plain; charset=UTF-8" }

/** Public empty file at /{code}.txt for eNamad. Rewritten here from next.config. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!/^[0-9]{1,64}$/.test(code)) {
    return new Response("", { status: 404, headers: PLAIN })
  }
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return new Response("", { status: 404, headers: PLAIN })
  }
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").replace(/:\d+$/, "")
  try {
    const res = await fetch(`${apiBase}/api/v1/public/enamad/${code}`, {
      headers: {
        Accept: "text/plain",
        ...internalApiHeaders(),
        ...(host ? { "X-Tenant-Domain": host } : {}),
      },
      cache: "no-store",
    })
    if (!res.ok) return new Response("", { status: 404, headers: PLAIN })
    return new Response("", {
      status: 200,
      headers: { ...PLAIN, "Cache-Control": "public, max-age=60" },
    })
  } catch {
    return new Response("", { status: 404, headers: PLAIN })
  }
}
