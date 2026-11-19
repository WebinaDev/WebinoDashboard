import assert from "node:assert/strict"
import { test } from "node:test"

import { closeOpenStyleTags, codeMatchesPath, splitCode } from "./custom-code.ts"

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

test("closeOpenStyleTags closes a truncated style block so later markup stays in the tree", () => {
  const out = closeOpenStyleTags('<style id="ak-glass-theme">.nav{color:red')
  assert.equal(out, '<style id="ak-glass-theme">.nav{color:red</style>')
  const wrapped = closeOpenStyleTags('<style>.a{color:red}</style><main>ok</main>')
  assert.equal(wrapped, '<style>.a{color:red}</style><main>ok</main>')
  const two = closeOpenStyleTags('<style>.a{}</style><style>.b{')
  assert.equal(two, '<style>.a{}</style><style>.b{</style>')
})

test("closeOpenStyleTags escapes an embedded </style sequence inside CSS", () => {
  const out = closeOpenStyleTags('<style>.x::before{content:"</style>"}</style><p>after</p>')
  assert.equal(out.includes('\\3C/style'), true, out)
  assert.equal(out.endsWith("</style><p>after</p>"), true, out)
})
