import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// isClearColor lives in a .tsx client module; test a copy of its contract against the source to keep this node-only.
const src = readFileSync(new URL("./poetry-pages-widgets.tsx", import.meta.url), "utf8")

test("poetry-nav applies capsuleBg (incl. transparent) to --akx-nav and marks clear capsules", () => {
  assert.match(src, /navBg: capsuleBg \|\| propStr\(p, "navBg"\)/)
  assert.match(src, /\["--akx-nav" as string\]: capsuleBg/)
  assert.match(src, /akx-nav-clear/)
  const css = readFileSync(new URL("./poetry-pages-widgets.css", import.meta.url), "utf8")
  assert.match(css, /\.akx-nav\.akx-nav-clear[^{]*\{[^}]*backdrop-filter: none/)
})
