import assert from "node:assert/strict"
import { after, test } from "node:test"

import { GET } from "./route.ts"

const originalFetch = globalThis.fetch
const originalApiUrl = process.env.INTERNAL_API_URL
const originalSiteSlug = process.env.WEBINO_SITE_SLUG

after(() => {
  globalThis.fetch = originalFetch
  if (originalApiUrl === undefined) delete process.env.INTERNAL_API_URL
  else process.env.INTERNAL_API_URL = originalApiUrl
  if (originalSiteSlug === undefined) delete process.env.WEBINO_SITE_SLUG
  else process.env.WEBINO_SITE_SLUG = originalSiteSlug
})

test("serves each site's verification code without caching", async () => {
  process.env.INTERNAL_API_URL = "http://api.example.local"
  delete process.env.WEBINO_SITE_SLUG
  globalThis.fetch = async (_input, init) => {
    const tenant = new Headers(init?.headers).get("X-Tenant-Domain")
    const code = tenant === "site-001.example.local" ? "sample_code_001" : "sample_code_002"
    return Response.json({ data: { code } })
  }

  for (const [host, code] of [["site-001.example.local", "sample_code_001"], ["site-002.example.local", "sample_code_002"]]) {
    const response = await GET(new Request("http://localhost/verify-platform.txt", { headers: { host } }))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), code)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain/)
  }
})

test("does not publish missing or invalid codes", async () => {
  for (const code of ["", "invalid\ncode", "<script>"]) {
    globalThis.fetch = async () => Response.json({ data: { code } })
    const response = await GET(new Request("http://localhost/verify-platform.txt"))
    assert.equal(response.status, 404)
    assert.equal(await response.text(), "")
  }
})
