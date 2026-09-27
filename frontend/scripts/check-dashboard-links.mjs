#!/usr/bin/env node
/**
 * Every literal "/dashboard/..." link in the frontend (and the dashboard hrefs the
 * backend overview builder emits) must resolve to a manifest route; links under
 * settings/ must match a section declared in src/lib/settings-nav.ts.
 * Run: node scripts/check-dashboard-links.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const backendApp = path.resolve(frontend, "../backend/app")

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

/** Manifests only import types, so each one transpiles to a standalone module. */
async function loadManifest(file) {
  const source = fs.readFileSync(file, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  const mod = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`)
  return Object.values(mod).filter((v) => v && Array.isArray(v.adminRoutes))
}

const registry = fs.readFileSync(path.join(frontend, "src/kernel/registry.ts"), "utf8")
const manifestFiles = [...registry.matchAll(/from "\.\.\/\.\.\/modules\/([^/"]+)\/manifest"/g)].map((m) =>
  path.join(frontend, "modules", m[1], "manifest.ts"),
)
const manifestPaths = []
for (const file of manifestFiles) {
  for (const manifest of await loadManifest(file)) {
    for (const route of manifest.adminRoutes) manifestPaths.push(route.path)
  }
}

const settingsNav = fs.readFileSync(path.join(frontend, "src/lib/settings-nav.ts"), "utf8")
const settingsRoutes = [...settingsNav.matchAll(/route:\s*"\/dashboard\/([^"]+)"/g)].map((m) => m[1])

if (manifestPaths.length === 0 || settingsRoutes.length === 0) {
  console.error("check-dashboard-links.mjs: no manifest or settings routes found")
  process.exit(1)
}

const WILDCARD = "\u0000"

function segmentMatches(pattern, actual) {
  return actual === WILDCARD || pattern.startsWith(":") || pattern === actual
}

function matchesPattern(pattern, actualParts) {
  const parts = pattern === "" ? [] : pattern.split("/")
  return parts.length === actualParts.length && parts.every((p, i) => segmentMatches(p, actualParts[i]))
}

function resolves(route) {
  const parts = route === "" ? [] : route.split("/")
  if (parts[0] === "settings" && parts.length > 1) {
    return settingsRoutes.some((r) => {
      const rp = r.split("/")
      return rp.length <= parts.length && rp.every((p, i) => segmentMatches(p, parts[i]))
    })
  }
  return manifestPaths.some((p) => matchesPattern(p, parts))
}

function normalize(raw) {
  let route = raw.replace(/\$\{[^}]*\}/g, WILDCARD).split(/[?#]/)[0]
  route = route.replace(/^\/dashboard\/?/, "").replace(/\/+$/, "")
  return route
}

const sources = [
  ...walk(path.join(frontend, "src"), [".ts", ".tsx"]),
  ...walk(path.join(frontend, "modules"), [".ts", ".tsx"]),
].filter((f) => !f.endsWith(".d.ts"))
const phpSources = walk(backendApp, [".php"])

const LITERAL = /(["'`])(\/dashboard(?:\/[^"'`\s]*)?)\1/g
const failures = []
let checked = 0

for (const file of [...sources, ...phpSources]) {
  const lines = fs.readFileSync(file, "utf8").split("\n")
  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\/?\*|#)/.test(line)) return
    for (const m of line.matchAll(LITERAL)) {
      const raw = m[2]
      if (m[1] !== "`" && raw.includes("${")) continue
      const route = normalize(raw)
      if (route.endsWith(WILDCARD) && route.split("/").every((s) => s === WILDCARD)) continue
      if (/[^/]\u0000|\u0000[^/]/.test(route)) continue
      checked++
      if (!resolves(route)) {
        failures.push(`${path.relative(path.resolve(frontend, ".."), file)}:${idx + 1} ${raw}`)
      }
    }
  })
}

if (failures.length > 0) {
  console.error(`Dashboard links that match no route (${failures.length}):`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`check-dashboard-links.mjs OK (${checked} links)`)
