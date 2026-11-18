import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const resp = await p.goto("https://alikhabari.ir/product/membership-premium-1-month", { waitUntil: "commit", timeout: 60000 })
const body = await resp.text()
console.log("status", resp.status(), "len", body.length, "sf-pdp", (body.match(/sf-pdp/g)||[]).length)
console.log("headers", JSON.stringify({cache: resp.headers()["x-cache"], age: resp.headers()["age"], server: resp.headers()["server"]}))
await b.close()
