import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
const bad=[]
p.on("response",r=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2500)
console.log(JSON.stringify([...new Set(bad)],null,1))
await b.close()
