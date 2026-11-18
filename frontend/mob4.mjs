import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const p=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true})).newPage()
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2500)
const info = await p.evaluate(()=>{
  const secs=[...document.querySelectorAll(".wb-section-stack > section")].map(s=>({cls:(s.className||"").slice(0,30), h:Math.round(s.getBoundingClientRect().height)}))
  return {docH:document.documentElement.scrollHeight, bodyH:document.body.scrollHeight, secs}
})
console.log(JSON.stringify(info,null,1))
await b.close()
