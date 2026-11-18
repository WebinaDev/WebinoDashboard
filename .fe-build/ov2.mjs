import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await ctx.newPage()
await p.goto("https://marsbgc.ir"+process.argv[2],{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
await p.waitForTimeout(800)
const res=await p.evaluate(()=>{
  const de=document.documentElement
  const base=de.scrollWidth-de.clientWidth
  const main=document.querySelector("main")||document.body
  const kids=[...main.children]
  const rows=[]
  for(const k of kids){
    const prev=k.style.display
    k.style.display="none"
    const cur=de.scrollWidth-de.clientWidth
    k.style.display=prev
    rows.push({tag:k.tagName,cls:(k.className||"").toString().slice(0,70),base,without:cur})
  }
  return {base, rows}
})
console.log(JSON.stringify(res,null,1))
await b.close()
