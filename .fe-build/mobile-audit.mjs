import { chromium } from "playwright"
const BASE="https://marsbgc.ir"
const routes=process.argv.slice(2)
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
const p=await ctx.newPage()
const out=[]
for(const r of routes){
  await p.goto(BASE+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  await p.waitForTimeout(1000)
  const info=await p.evaluate(()=>{
    const de=document.documentElement
    const overflow=de.scrollWidth-de.clientWidth
    const wide=[...document.querySelectorAll("body *")].filter(e=>{const r=e.getBoundingClientRect();return r.width>de.clientWidth+2 && r.height>0 && getComputedStyle(e).position!=="fixed"}).slice(0,6).map(e=>`${e.tagName}.${(e.className||"").toString().slice(0,40)}:${Math.round(e.getBoundingClientRect().width)}`)
    const small=[...document.querySelectorAll("a,button")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<32||r.width<32)}).slice(0,6).map(e=>`${e.tagName}:${e.textContent.trim().slice(0,18)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)
    return {overflow,wide,small,h:de.scrollHeight}
  })
  out.push({route:r,...info})
}
console.log(JSON.stringify(out,null,1))
await b.close()
