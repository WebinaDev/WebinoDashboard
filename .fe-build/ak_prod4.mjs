import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,120))})
await p.goto("https://alikhabari.ir/product/قاب-فاطمیه-کد-fh-05", { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(3000)
const d = await p.evaluate(() => ({
  pdp: document.querySelectorAll("[class*=sf-pdp]").length,
  h1: document.querySelector("h1")?.textContent ?? null,
  txt: document.body.innerText.replace(/\n{2,}/g,"\n").slice(0,400)
}))
console.log(JSON.stringify(d), errs.slice(0,4))
await p.screenshot({ path: "/tmp/ak/product.png" })
await b.close()
