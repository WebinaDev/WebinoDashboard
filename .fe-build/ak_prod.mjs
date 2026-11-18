import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args:["--no-sandbox"] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const url = "https://alikhabari.ir/product/" + "قاب-فاطمیه-۱" + "?cb=" + Date.now()
const r = await p.goto(url, { waitUntil: "networkidle", timeout: 90000 })
await p.waitForTimeout(1500)
const info = await p.evaluate(() => {
  const shell = document.querySelector(".sf-pdp-shell")
  const img = document.querySelector(".sf-pdp img")
  const h1 = document.querySelector(".sf-pdp h1")
  const btn = [...document.querySelectorAll(".sf-pdp button")].find(b => /سبد/.test(b.textContent))
  return { status: !!shell, shellW: shell && Math.round(shell.getBoundingClientRect().width),
    h1: h1?.textContent, h1Color: h1 && getComputedStyle(h1).webkitTextFillColor,
    imgW: img && Math.round(img.getBoundingClientRect().width),
    btnBg: btn && getComputedStyle(btn).backgroundImage.slice(0,40),
    sections: document.querySelectorAll(".sf-pdp-shell section").length }
})
console.log(r.status(), JSON.stringify(info))
await p.screenshot({ path: "/tmp/ak/product.png", fullPage: false })
await b.close()
