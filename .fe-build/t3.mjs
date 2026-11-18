import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
await p.goto("https://alikhabari.ir/", { waitUntil: "domcontentloaded", timeout: 90000 })
await p.waitForTimeout(4000)
await p.evaluate(() => document.querySelector(".wpv-hl").scrollIntoView({ block: "center" }))
await p.waitForTimeout(600)
const before = await p.evaluate(() => {
  const sec = document.querySelector(".wpv-hl")
  const t = sec.querySelector(".wpv-track")
  const btns = [...sec.querySelectorAll(".wpz-carrow")]
  return { scroll: t.scrollLeft, btns: btns.map(b => ({ l: b.getAttribute("aria-label"), dis: b.disabled })) }
})
const nb = p.locator('.wpv-hl .wpz-carrow[aria-label="بعدی"]')
await nb.click()
await p.waitForTimeout(1200)
const after = await p.evaluate(() => document.querySelector(".wpv-hl .wpv-track").scrollLeft)
console.log(JSON.stringify({ before, after }, null, 1))
await b.close()
