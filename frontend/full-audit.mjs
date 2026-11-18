import { chromium } from "playwright"
const BASE="https://marsbgc.ir"
const routes = ["/","/shop","/product/catan","/product/carcassonne","/product/splendor","/product/codenames","/product/dixit","/product/azul","/product/mafia","/product/seafarers","/product/dice-set","/product/playmat","/cart","/checkout","/account","/about","/shipping","/privacy","/blog","/blog/two-player-board-games","/blog/choose-board-game-for-your-group","/contact","/compare","/wishlist","/amazing-offers","/order-tracking","/search?q=کاتان","/shop?category=card-games","/shop?sort=price_asc"]
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:1440,height:1000}})
const p=await ctx.newPage()
const errs=[]
p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,120))})
const rows=[]
for(const r of routes){
  errs.length=0
  let status=0
  try{ const resp=await p.goto(BASE+r,{waitUntil:"networkidle",timeout:45000}); status=resp?.status()??0 }catch{ status=-1 }
  await p.waitForTimeout(700)
  const info=await p.evaluate(()=>{
    const imgs=[...document.querySelectorAll("img")]
    return {
      h1:[...document.querySelectorAll("h1")].map(e=>e.textContent.trim()).slice(0,2),
      broken:[...new Set(imgs.filter(i=>i.currentSrc&&!i.naturalWidth).map(i=>i.currentSrc))].slice(0,5),
      len:document.body.innerText.replace(/\s+/g," ").trim().length,
      iso:/20\d\d-\d\d-\d\dT\d\d:\d\d/.test(document.body.innerText),
      rawTag:/<p>|<h3>/.test(document.body.innerText),
    }
  })
  rows.push({r,status,...info,err:[...new Set(errs)].filter(e=>!e.includes("401")).slice(0,3)})
}
const bad = rows.filter(x=>x.status!==200||x.broken.length||x.iso||x.rawTag||x.len<120||x.err.length)
console.log("checked",rows.length,"problems",bad.length)
console.log(JSON.stringify(bad,null,1))
await b.close()
