import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
const logs=[]
p.on("console",m=>logs.push(m.type()+":"+m.text().slice(0,200)))
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2000)
const r = await p.evaluate(async()=>{
  const res = await fetch("/api/v1/public/nav-menus",{credentials:"include"})
  const j = await res.json().catch(()=>null)
  return { status: res.status, keys: j?.data ? Object.keys(j.data.menus||{}) : null, locs: j?.data?.locations }
})
console.log("fetch:", JSON.stringify(r))
console.log("logs:", JSON.stringify(logs.slice(0,10),null,1))
await b.close()
