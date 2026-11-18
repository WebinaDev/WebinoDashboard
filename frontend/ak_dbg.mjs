import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto("https://alikhabari.ir/?cb=" + Date.now(), { waitUntil: "networkidle", timeout: 60000 })
const o = await p.evaluate(() => {
  const el = document.querySelector(".wpv-vc-media")
  const cs = getComputedStyle(el)
  const sec = document.getElementById("wpv-vg-w_9fe8964615")
  return { aspect: cs.aspectRatio, varv: sec ? getComputedStyle(sec).getPropertyValue("--wpv-vc-ratio") : "no-sec",
           inline: el.getAttribute("style"), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }
})
console.log(JSON.stringify(o))
await b.close()
