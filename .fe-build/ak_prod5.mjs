import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const bad=[]
p.on("response", r => { if (r.status() >= 400) bad.push(r.status()+" "+r.url().slice(0,110)) })
await p.goto("https://alikhabari.ir/product/قاب-فاطمیه-کد-fh-05", { waitUntil: "networkidle", timeout: 60000 })
await p.waitForTimeout(4000)
const d = await p.evaluate(() => ({ s4: !!document.getElementById("S:4"), p4: !!document.getElementById("P:4"), main: document.querySelector("main")?.innerHTML.length ?? -1 }))
console.log(JSON.stringify(d), JSON.stringify(bad.slice(0,6)))
await b.close()
