import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/product/membership-premium-1-month", { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(2500)
const h = await p.evaluate(() => document.body.innerHTML)
console.log(h.length)
console.log(h.slice(0, 1500))
await b.close()
