import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await p.goto("https://alikhabari.ir/", { waitUntil: "domcontentloaded", timeout: 90000 })
await p.waitForTimeout(3000)
console.log(JSON.stringify(await p.evaluate(() => {
  const t = document.body.innerText
  return { escInText: (t.match(/\\u[0-9a-f]{4}/g) || []).length, head: t.slice(0, 220).replace(/\n/g, " | ") }
})))
await b.close()
