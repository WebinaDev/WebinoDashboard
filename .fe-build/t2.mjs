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
  res.css = { snap: getComputedStyle(t).scrollSnapType, ov: getComputedStyle(t).overflowX, dir: getComputedStyle(t).direction }
  res.items = [...t.children].map(c => Math.round(c.getBoundingClientRect().width))
  t.scrollBy({ left: -200 })
  await new Promise(r => setTimeout(r, 600))
  res.afterManual = t.scrollLeft
  t.scrollTo({ left: -174 })
  await new Promise(r => setTimeout(r, 600))
  res.afterTo = t.scrollLeft
  // now click next via real mouse
  const nb = [...sec.querySelectorAll(".wpz-carrow")].find(b => b.getAttribute("aria-label") === "بعدی")
  const r = nb.getBoundingClientRect()
  res.btnBox = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  res.topEl = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)?.className?.toString?.().slice(0,60)
  return res
})
console.log(JSON.stringify(out, null, 1))
await b.close()
