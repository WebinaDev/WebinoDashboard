#!/usr/bin/env node
/**
 * Flags likely hardcoded English UI strings in TSX (placeholder/aria-label/title/label
 * attributes and simple JSX text children). Allows HTTP header names, URL placeholders,
 * and a small allowlist. Run: node scripts/check-english-jsx.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const roots = [path.join(frontend, "src"), path.join(frontend, "modules")]

const ATTR = /\b(?:placeholder|aria-label|title|label|alt)=["']([^"']+)["']/g
const CHILD = />([A-Za-z][A-Za-z0-9 ,./&()_-]{1,60})</g

const ALLOW_EXACT = new Set([
  "X-Frame-Options",
  "Referrer-Policy",
  "Content-Type",
  "Authorization",
  "POST",
  "GET",
  "PATCH",
  "DELETE",
  "PUT",
  "OK",
  "SMS",
  "OTP",
  "PWA",
  "SEO",
  "ERP",
  "POS",
  "WAF",
  "API",
  "URL",
  "SKU",
  "ID",
  "HTML",
  "JSON",
  "CSS",
  "IR",
  "AE",
  "USDT",
  "TON",
])

const ALLOW_PREFIX = ["https://", "http://", "www.", "dkp-", "••••"]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "ui") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

function hasPersian(s) {
  return /[\u0600-\u06FF]/.test(s)
}

function allowed(value) {
  const v = value.trim()
  if (!v) return true
  if (ALLOW_EXACT.has(v)) return true
  if (ALLOW_PREFIX.some((p) => v.startsWith(p))) return true
  if (hasPersian(v)) return true
  // pure code-ish tokens without spaces (identifiers) — skip unless known offender phrases
  if (!/\s/.test(v) && /^[A-Za-z0-9._:-]+$/.test(v) && v.length < 24) return true
  // template / path
  if (v.startsWith("/") || v.startsWith("#") || v.includes("${")) return true
  return false
}

const hits = []
for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8")
    const lines = text.split(/\n/)
    lines.forEach((line, idx) => {
      const s = line.trim()
      if (s.startsWith("//") || s.startsWith("*") || s.startsWith("import ")) return
      ATTR.lastIndex = 0
      let m
      while ((m = ATTR.exec(line))) {
        const val = m[1]
        if (!allowed(val) && /[A-Za-z]/.test(val)) {
          hits.push({ file, line: idx + 1, kind: "attr", value: val })
        }
      }
      CHILD.lastIndex = 0
      while ((m = CHILD.exec(line))) {
        const val = m[1].trim()
        if (!allowed(val) && /[A-Za-z]/.test(val) && /\s/.test(val)) {
          hits.push({ file, line: idx + 1, kind: "child", value: val })
        }
      }
    })
  }
}

if (hits.length) {
  console.error(`check-english-jsx.mjs: ${hits.length} hardcoded English UI string(s):`)
  for (const h of hits.slice(0, 80)) {
    console.error(`  ${path.relative(frontend, h.file)}:${h.line} [${h.kind}] ${JSON.stringify(h.value)}`)
  }
  if (hits.length > 80) console.error(`  … and ${hits.length - 80} more`)
  process.exit(1)
}

console.log("check-english-jsx.mjs OK")
