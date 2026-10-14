import assert from "node:assert/strict"
import { test } from "node:test"

import { codeMatchesPath, splitCode } from "./custom-code.ts"

test("custom code path scope", () => {
  assert.equal(codeMatchesPath({ enabled: true, paths: "" }, "/x"), true)
  assert.equal(codeMatchesPath({ enabled: false, paths: "" }, "/x"), false)
  assert.equal(codeMatchesPath({ enabled: true, paths: "/shop*\n/about" }, "/shop/p?x=1"), true)
  assert.equal(codeMatchesPath({ enabled: true, paths: "/about" }, "/about/"), true)
  assert.equal(codeMatchesPath({ enabled: true, paths: "/about" }, "/aboutus"), false)
})

test("split code into scripts and markup", () => {
  const parts = splitCode('<meta name="x"><script async src="https://a.com/t.js"></script><script>window.a=1</script><script src="javascript:1"></script>')
  assert.deepEqual(parts[0], { kind: "html", body: '<meta name="x">' })
  assert.equal(parts[1].kind === "script" && parts[1].src, "https://a.com/t.js")
  assert.equal(parts[2].kind === "script" && parts[2].body, "window.a=1")
  assert.equal(parts[3].kind === "script" && parts[3].src, undefined)
})
