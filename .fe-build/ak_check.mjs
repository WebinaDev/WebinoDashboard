import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/?cb=" + Date.now(), { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(2500)
const info = await p.evaluate(() => {
  const vc = document.querySelector(".wpv-vc-media")
  const r = vc?.getBoundingClientRect()
  const hs = document.querySelector(".wpz-hs")
  const heroImg = document.querySelector(".wpz-hero-full img, .wpz-hs img")
  const locked = document.querySelector(".wpz-verse-card.is-locked")
  const t = locked?.querySelector(".wpz-verse-title")
  return {
    video: r ? { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3) } : null,
    heroSlider: !!hs, heroImgSrc: heroImg?.getAttribute("src")?.slice(0, 60) ?? null,
    heroImgLoaded: heroImg ? heroImg.naturalWidth > 0 : null,
    lockedTitle: t?.textContent, lockedTitleFilter: t ? getComputedStyle(t).filter : null,
    slides: document.querySelectorAll(".wpz-hs-slide").length,
  }
})
console.log(JSON.stringify(info, null, 1))
await p.screenshot({ path: "/tmp/ak/home_top.png" })
await p.evaluate(() => { const el = document.querySelector(".wpv-vg"); el?.scrollIntoView() })
await p.waitForTimeout(1200)
await p.screenshot({ path: "/tmp/ak/home_video.png" })
await p.evaluate(() => { const el = document.querySelector(".wpz-verse-card.is-locked"); el?.scrollIntoView() })
await p.waitForTimeout(1000)
await p.screenshot({ path: "/tmp/ak/home_premium.png" })
await b.close()
