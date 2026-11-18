import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:1440,height:1000}})
const p=await ctx.newPage()
for(const [name,url] of [["home","/"],["shop","/shop"],["pdp","/product/catan"],["blog","/blog"],["post","/blog/two-player-board-games"],["about","/about"]]){
  await p.goto("https://marsbgc.ir"+url,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  await p.waitForTimeout(2000)
  await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60))} window.scrollTo(0,0)})
  await p.waitForTimeout(800)
  await p.screenshot({path:`/tmp/mars-shots/${name}.png`,fullPage:true})
}
await b.close()
