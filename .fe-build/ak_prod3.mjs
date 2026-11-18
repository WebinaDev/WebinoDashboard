import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/product/قاب-فاطمیه-۱?cb="+Date.now(), { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(3000)
const t = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g,"\n").slice(0,900))
console.log(t)
await b.close()
