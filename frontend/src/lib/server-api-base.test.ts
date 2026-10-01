import assert from "node:assert/strict"
import test from "node:test"

import { resolveServerApiBase } from "./server-api-base.ts"

test("replaces the shared backend name when a site slug is set", () => {
  assert.equal(
    resolveServerApiBase({
      internalApiUrl: "http://backend:8080",
      siteSlug: "bluecafe",
    }),
    "http://ws-bluecafe-backend:8080",
  )
})

test("keeps an explicit unique tenant origin", () => {
  assert.equal(
    resolveServerApiBase({
      internalApiUrl: "http://ws-bluecafe-backend:8080",
      siteSlug: "bluecafe",
    }),
    "http://ws-bluecafe-backend:8080",
  )
})

test("keeps http://backend for a single-stack compose without a slug", () => {
  assert.equal(
    resolveServerApiBase({ internalApiUrl: "http://backend:8080" }),
    "http://backend:8080",
  )
})

test("uses the slug when no internal URL is configured", () => {
  assert.equal(
    resolveServerApiBase({ siteSlug: "BlueCafe" }),
    "http://ws-bluecafe-backend:8080",
  )
})

test("ignores a slug that is not a hostname label", () => {
  assert.equal(
    resolveServerApiBase({
      internalApiUrl: "http://backend:8080",
      siteSlug: "not a slug",
    }),
    "http://backend:8080",
  )
})
