import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
await p.goto("https://alikhabari.ir/", { waitUntil: "domcontentloaded", timeout: 90000 })
await p.waitForTimeout(4000)
const out = await p.evaluate(async () => {
  const res = {}
  const sec = document.querySelector(".wpv-hl")
  const t = sec.querySelector(".wpv-track")
  const first = t.firstElementChild.getBoundingClientRect()
  res.before = { scroll: t.scrollLeft, firstX: Math.round(first.x), sw: t.scrollWidth, cw: t.clientWidth }
  const next = [...sec.querySelectorAll(".wpz-carrow")].find(b => b.getAttribute("aria-label") === "بعدی")
  next.click()
  await new Promise(r => setTimeout(r, 900))
  const f2 = t.firstElementChild.getBoundingClientRect()
  res.afterNext = { scroll: t.scrollLeft, firstX: Math.round(f2.x) }
  return res
})
console.log(JSON.stringify(out, null, 1))
await b.close()
