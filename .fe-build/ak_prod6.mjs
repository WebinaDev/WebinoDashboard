import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/product/membership-premium-1-month", { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(2000)
console.log(JSON.stringify({ url: p.url(), title: await p.title(), htmlLen: (await p.content()).length }))
const html = await p.content()
console.log("has sf-pdp:", html.includes("sf-pdp"), "| has notfound:", html.includes("یافت نشد"), "| has 404:", html.includes("۴۰۴"))
await b.close()
