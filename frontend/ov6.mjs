import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
for(const cfg of [{name:"plain",viewport:{width:390,height:844}},{name:"isMobile",viewport:{width:390,height:844},isMobile:true,hasTouch:true}]){
const ctx=await b.newContext(cfg)
const p=await ctx.newPage()
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
await p.waitForTimeout(1500)
const before=await p.evaluate(()=>({ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,sx:window.scrollX,sl:document.documentElement.scrollLeft}))
const after=await p.evaluate(()=>{window.scrollTo(0,0);return {ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,sx:window.scrollX,sl:document.documentElement.scrollLeft}})
console.log(cfg.name, JSON.stringify({before,after}))
await ctx.close()
}
await b.close()
