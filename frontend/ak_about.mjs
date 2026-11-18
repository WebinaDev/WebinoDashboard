import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/?cb=" + Date.now(), { waitUntil: "networkidle", timeout: 90000 })
const sec = await p.$(".wpz-about, [class*=about]")
if (sec) { await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(2500) }
const info = await p.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].filter(i => /aliPoetPortrait/.test(i.src))
  return imgs.map(i => { const r=i.getBoundingClientRect(); return { nat:i.naturalWidth, w:Math.round(r.width), h:Math.round(r.height), inFooter: !!i.closest(".wbx-seals") } })
})
console.log(JSON.stringify(info))
await p.screenshot({ path: "/tmp/ak/about.png" })
await b.close()
