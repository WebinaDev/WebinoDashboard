#!/usr/bin/env node
// Field-by-field diff of builder widget definitions between two builder source dirs.
// Usage: node scripts/widget-diff.mjs <dirA> <dirB> [--json out.json] [--md out.md]
// Statically parses registry*.ts / widgets*.ts (TypeScript AST) for object literals with `type` + `fields`.
import ts from "typescript"
import fs from "node:fs"
import path from "node:path"

function files(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String)
    .filter(f => /(^|\/)(registry[^/]*|widgets[^/]*)\.ts$/.test(f) && !f.endsWith(".test.ts"))
    .map(f => path.join(dir, f))
}
const lit = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined
function prop(obj, name) {
  for (const p of obj.properties) if (ts.isPropertyAssignment(p) && (p.name.text ?? p.name.getText()) === name) return p.initializer
}
function extract(dir) {
  const out = {}
  for (const f of files(dir)) {
    const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true)
    const visit = n => {
      if (ts.isObjectLiteralExpression(n)) {
        const type = lit(prop(n, "type")), fields = prop(n, "fields")
        if (type && fields && ts.isArrayLiteralExpression(fields)) {
          const fs_ = {}
          for (const el of fields.elements) if (ts.isObjectLiteralExpression(el)) {
            const key = lit(prop(el, "key")); if (!key) continue
            const opts = prop(el, "options")
            fs_[key] = { kind: lit(prop(el, "kind")) ?? "?", options: opts && ts.isArrayLiteralExpression(opts) ? opts.elements.map(o => ts.isObjectLiteralExpression(o) ? lit(prop(o, "value")) : o.getText()).join("|") : undefined }
          }
          out[type] = { file: path.relative(dir, f), fields: { ...(out[type]?.fields ?? {}), ...fs_ } }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return out
}
const [A, B, ...rest] = process.argv.slice(2)
if (!A || !B) { console.error("usage: widget-diff.mjs <dirA> <dirB> [--json f] [--md f]"); process.exit(2) }
const a = extract(A), b = extract(B)
const types = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
const rows = []
for (const t of types) {
  if (!a[t]) { rows.push({ type: t, status: "only-B" }); continue }
  if (!b[t]) { rows.push({ type: t, status: "only-A" }); continue }
  const keys = [...new Set([...Object.keys(a[t].fields), ...Object.keys(b[t].fields)])]
  const diffs = []
  for (const k of keys) {
    const x = a[t].fields[k], y = b[t].fields[k]
    if (!x) diffs.push(`+B ${k}(${y.kind})`)
    else if (!y) diffs.push(`+A ${k}(${x.kind})`)
    else if (x.kind !== y.kind || x.options !== y.options) diffs.push(`~ ${k}: ${x.kind}[${x.options ?? ""}] vs ${y.kind}[${y.options ?? ""}]`)
  }
  rows.push({ type: t, status: diffs.length ? "differs" : "same", diffs })
}
const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined }
const cnt = s => rows.filter(r => r.status === s).length
const md = [`# Widget settings diff`, `A=${A}`, `B=${B}`, ``,
  `same: ${cnt("same")} · differs: ${cnt("differs")} · only-A: ${cnt("only-A")} · only-B: ${cnt("only-B")}`, ``,
  `| type | status | differences |`, `|---|---|---|`,
  ...rows.map(r => `| ${r.type} | ${r.status} | ${(r.diffs ?? []).join("<br>")} |`)].join("\n")
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(rows, null, 2))
if (opt("--md")) fs.writeFileSync(opt("--md"), md); else console.log(md)
