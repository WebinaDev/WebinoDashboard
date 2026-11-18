import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/?cb=" + Date.now(), { waitUntil: "networkidle", timeout: 90000 })
await p.waitForTimeout(2000)
const info = await p.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].filter(i => /aliPoetPortrait/.test(i.src))
  return imgs.map(i => ({ w: i.naturalWidth, h: i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) }))
})
console.log(JSON.stringify(info))
await p.screenshot({ path: "/tmp/ak/home_full.png", fullPage: true })
await b.close()
