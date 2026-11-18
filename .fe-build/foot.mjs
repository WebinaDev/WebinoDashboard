import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2500)
const out = await p.evaluate(()=>{
  const f=document.querySelector("footer")
  return { text: f.innerText.replace(/\s+/g," ").slice(0,900), links: [...f.querySelectorAll("a")].map(a=>a.getAttribute("href")+"|"+a.textContent.trim()).slice(0,30) }
})
console.log(JSON.stringify(out,null,1))
await b.close()
