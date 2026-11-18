import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/product/membership-premium-1-month", { waitUntil: "domcontentloaded", timeout: 60000 })
const early = await p.evaluate(() => ({ pdp: document.querySelectorAll("[class*=sf-pdp]").length, s4: !!document.getElementById("S:4") }))
await p.waitForTimeout(4000)
const late = await p.evaluate(() => ({ pdp: document.querySelectorAll("[class*=sf-pdp]").length, s4: !!document.getElementById("S:4"), txt: document.body.innerText.replace(/\n{2,}/g,"\n").slice(0,300) }))
console.log("early", JSON.stringify(early)); console.log("late", JSON.stringify(late))
await b.close()
