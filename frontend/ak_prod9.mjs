import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const logs=[]; p.on("console", m=>logs.push(m.type()+":"+m.text().slice(0,100)))
await p.goto("https://alikhabari.ir/product/membership-premium-1-month", { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(3000)
const d = await p.evaluate(() => ({ h: document.body.scrollHeight, divs: document.querySelectorAll("div").length, hidden: [...document.querySelectorAll("[hidden]")].length }))
console.log(JSON.stringify(d), JSON.stringify(logs.slice(0,5)))
await b.close()
