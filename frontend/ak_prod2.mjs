import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const errs=[]; p.on("pageerror", e=>errs.push(e.message))
const r = await p.goto("https://alikhabari.ir/product/قاب-فاطمیه-۱?cb="+Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 })
await p.waitForTimeout(6000)
const d = await p.evaluate(() => ({
  html: document.documentElement.outerHTML.length,
  pdp: document.querySelectorAll("[class*=sf-pdp]").length,
  h1: document.querySelector("h1")?.textContent,
  bodyStart: document.body.innerText.slice(0,200)
}))
console.log(r.status(), JSON.stringify(d), errs.slice(0,3))
await b.close()
