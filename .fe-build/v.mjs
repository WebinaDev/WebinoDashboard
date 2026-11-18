import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
const go = async (u) => { await p.goto("https://alikhabari.ir"+u, { waitUntil: "domcontentloaded", timeout: 90000 }); await p.waitForTimeout(3500) }
await go("/")
const r = await p.evaluate(() => {
  const out = {}
  const hl = document.querySelector(".wpv-hl .wpz-carrows")
  out.hlArrows = hl ? [...hl.querySelectorAll("button")].map(b => ({ l: b.getAttribute("aria-label"), x: Math.round(b.getBoundingClientRect().x), ic: b.querySelector("svg")?.getAttribute("class") })) : "none"
  const t = document.querySelector(".wpv-hl .wpv-track")
  out.hlScroll = t ? [t.scrollWidth, t.clientWidth] : "none"
  const vc = document.querySelector(".wpv-vc-media")
  if (vc) { const q = vc.getBoundingClientRect(); out.video = { w: Math.round(q.width), h: Math.round(q.height), ratio: +(q.width/q.height).toFixed(3) } }
  const prem = document.querySelector("#ak-premium")
  if (prem) {
    const card = prem.querySelector(".wpv-verse-card")
    const title = card?.querySelector(".wpz-verse-title")
    const veil = card?.querySelector(".wpv-veil-blur")
    out.premium = {
      title: title?.textContent, titleFilter: title ? getComputedStyle(title).filter : null,
      veilFilter: veil ? getComputedStyle(veil).filter : null,
      badge: !!card?.querySelector(".wpv-badge"), cta: !!card?.querySelector(".wpv-veil-btn"),
      count: prem.querySelectorAll(".wpv-verse-card").length,
    }
  }
  const seek = document.querySelector(".wpv-ap-seek input[type=range]")
  out.seekDir = seek ? getComputedStyle(seek).direction : null
  return out
})
console.log("HOME", JSON.stringify(r, null, 1))
await go("/shop")
console.log("SHOP", JSON.stringify(await p.evaluate(() => ({ empty: !!document.querySelector(".akx-empty"), cards: document.querySelectorAll(".akx-card, .akx-prod, article").length, hasPink: /f7c1dc|E16BA6/i.test(document.body.innerHTML) }))))
await b.close()
