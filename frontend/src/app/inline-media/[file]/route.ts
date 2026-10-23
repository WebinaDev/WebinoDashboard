import { readFile } from "node:fs/promises"
import path from "node:path"

import { INLINE_MEDIA_DIR, INLINE_MEDIA_TYPES } from "@/lib/inline-media"

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const m = /^([a-f0-9]{32})\.([a-z]+)$/.exec(file)
  const type = m ? INLINE_MEDIA_TYPES[m[2]] : undefined
  if (!m || !type) return new Response("Not found", { status: 404 })
  try {
    const body = await readFile(path.join(INLINE_MEDIA_DIR, file))
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(m[2] === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    })
  } catch {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  }
}
