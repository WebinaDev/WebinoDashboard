import assert from "node:assert/strict"
import test from "node:test"

import { hasZibalSeal, sanitizeSealHtml, splitSeals } from "./seal-html.ts"

const ENAMAD = `<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=8553140&Code=uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=8553140&Code=uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS' alt='' style='cursor:pointer' code='uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS'></a>`

test("keeps enamad link and image, drops style and scripts", () => {
  const clean = sanitizeSealHtml(`${ENAMAD}<script>alert(1)</script><iframe src="https://evil.test"></iframe>`)
  assert.match(clean, /href="https:\/\/trustseal\.enamad\.ir\/\?id=8553140&amp;Code=uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS"/)
  assert.match(clean, /src="https:\/\/trustseal\.enamad\.ir\/logo\.aspx\?id=8553140&amp;Code=uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS"/)
  assert.match(clean, /code="uq52TNhHeVmw2jHoyCTxCQEQ5gWUm4HS"/)
  assert.match(clean, /rel="noopener noreferrer"/)
  assert.equal(clean.includes("script"), false)
  assert.equal(clean.includes("iframe"), false)
  assert.equal(clean.includes("cursor:pointer"), false)
  assert.equal(clean.includes("javascript:"), false)
})

test("drops javascript urls and empty or text-only markup", () => {
  assert.equal(sanitizeSealHtml('<a href="javascript:alert(1)"><img src="javascript:alert(1)"></a>'), "")
  assert.equal(sanitizeSealHtml(""), "")
  assert.equal(sanitizeSealHtml("<div>   </div>"), "")
  assert.equal(sanitizeSealHtml("فقط متن"), "")
})

test("splitSeals breaks on ### and ignores blanks", () => {
  assert.deepEqual(splitSeals(` ${ENAMAD} \n###\n\n`), [ENAMAD])
  assert.equal(splitSeals("").length, 0)
  assert.equal(splitSeals("  ###  ").length, 0)
})

test("keeps a Zibal slot and strips their script tag", () => {
  const raw = `<div id="zibal"><a href="https://zibal.ir/trust/123"><img src="https://zibal.ir/trust/123.png" alt="زیبال"></a></div><script src="https://zibal.ir/trust/scripts/zibal-trust-v4.js"></script>`
  const clean = sanitizeSealHtml(raw)
  assert.match(clean, /id="zibal"/)
  assert.match(clean, /href="https:\/\/zibal\.ir\/trust\/123"/)
  assert.equal(clean.includes("script"), false)
  assert.equal(hasZibalSeal(raw), true)
  assert.equal(hasZibalSeal(clean), true)
  assert.equal(hasZibalSeal("<a href='https://enamad.ir/x'>x</a>"), false)
})
