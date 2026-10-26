#!/usr/bin/env node
// CI guard: fail when a consumer builder defines a widget type locally that @webina/ui already ships.
// Usage: node node_modules/@webina/ui/scripts/check-duplicates.mjs <consumer builder src dir> [--allow type,type]
import ts from "typescript"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const lit = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined
const prop = (o, k) => o.properties.find(p => ts.isPropertyAssignment(p) && (p.name.text ?? p.name.getText()) === k)?.initializer
function defs(dir, filter) {
  const found = new Map()
  for (const rel of fs.readdirSync(dir, { recursive: true }).map(String)) {
    if (!rel.endsWith(".ts") || rel.endsWith(".test.ts") || rel.endsWith(".d.ts") || !filter(rel)) continue
    const f = path.join(dir, rel)
    const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true)
    const v = n => {
      if (ts.isObjectLiteralExpression(n)) {
        const t = lit(prop(n, "type")), fl = prop(n, "fields")
        if (t && fl && ts.isArrayLiteralExpression(fl) && prop(n, "label")) found.set(t, rel)
      }
      ts.forEachChild(n, v)
    }
    v(sf)
  }
  return found
}
const [dir, ...rest] = process.argv.slice(2)
if (!dir) { console.error("usage: check-duplicates.mjs <builder dir> [--allow a,b]"); process.exit(2) }
const allow = new Set((rest[rest.indexOf("--allow") + 1] && rest.includes("--allow") ? rest[rest.indexOf("--allow") + 1] : "").split(",").filter(Boolean))
const pkgSrc = path.join(here, "..", "src", "builder")
const shared = defs(pkgSrc, r => /^widgets[^/]*\.ts$/.test(r))
const local = defs(dir, r => /(^|\/)registry[^/]*\.ts$/.test(r))
const dups = [...local].filter(([t]) => shared.has(t) && !allow.has(t))
if (dups.length) {
  console.error(`✗ ${dups.length} widget type(s) defined locally AND in @webina/ui (edit them in @webina/ui instead):`)
  for (const [t, f] of dups) console.error(`  - ${t}  (${f})  vs @webina/ui ${shared.get(t)}`)
  process.exit(1)
}
console.log(`✓ no duplicate widget definitions (${local.size} local, ${shared.size} shared)`)
