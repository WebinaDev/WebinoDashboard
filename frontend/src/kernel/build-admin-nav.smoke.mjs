#!/usr/bin/env node
/**
 * Lightweight nav-manifest assertions (no TS bundler required).
 * Run: node src/kernel/build-admin-nav.smoke.mjs
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../modules")

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8")
}

const commerce = read("commerce/manifest.ts")
const cafe = read("cafe/manifest.ts")
const marketing = read("marketing/manifest.ts")
const users = read("users/manifest.ts")
const analytics = read("analytics/manifest.ts")
const core = read("core/manifest.ts")
const ai = read("ai-content/manifest.ts")
const magazine = read("magazine/manifest.ts")
const cms = read("cms/manifest.ts")

assert.match(commerce, /section:\s*"commerce"/)
assert.match(commerce, /navGroup:\s*"shop"/)
assert.match(commerce, /navGroup:\s*"orders"/)
assert.match(commerce, /navGroup:\s*"account"/)
assert.match(commerce, /navGroup:\s*"accounting"/)
assert.match(commerce, /path:\s*"product-catalog"/)
assert.match(commerce, /path:\s*"pricing\/quick-add"/)
assert.match(commerce, /path:\s*"pricing\/bulk-editor"/)
assert.match(commerce, /path:\s*"pricing\/price-changer"/)
assert.match(commerce, /path:\s*"accounting"/)
assert.match(cafe, /section:\s*"cafe"/)
assert.match(marketing, /marketing\/sale-prices/)
assert.match(marketing, /navGroup:\s*"marketing"/)
assert.match(marketing, /navGroup:\s*"sms"/)
assert.match(marketing, /navHidden:\s*true/)
assert.match(marketing, /section:\s*"marketing"/)
assert.doesNotMatch(marketing, /section:\s*"commerce"/)
assert.match(marketing, /path:\s*"notifications"/)
assert.match(marketing, /section:\s*"tools"/)
assert.match(users, /path:\s*"tickets"/)
assert.match(users, /path:\s*"support"/)
assert.match(users, /navGroup:\s*"users"/)
assert.match(analytics, /section:\s*"reports"/)
assert.match(analytics, /navGroup:\s*"performance"/)
assert.match(core, /navHidden:\s*true/s)
assert.match(core, /navGroup:\s*"settings"/)
assert.match(core, /navGroup:\s*"marketplace"/)
assert.match(core, /settings\/site\/security/)
assert.match(core, /navGroup:\s*"media"/)
assert.match(core, /section:\s*"content"/)
assert.match(core, /path:\s*"media\/folders"/)
assert.match(core, /path:\s*"license"/)
assert.match(magazine, /section:\s*"content"/)
assert.match(magazine, /navGroup:\s*"magazine"/)
assert.match(magazine, /path:\s*"magazine\/categories"/)
assert.match(cms, /section:\s*"content"/)
assert.match(cms, /path:\s*"pages"/)
assert.match(ai, /section:\s*"tools"/)
assert.doesNotMatch(core, /coreRoutes\("themes"/)

const layout = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../views/DashboardLayoutPage.tsx"),
  "utf8",
)
assert.match(layout, /p-3 sm:gap-4 sm:p-4/)
assert.doesNotMatch(layout, /sm:pt-0/)
assert.doesNotMatch(layout, /projects=\{\[\]\}/)

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const resolver = fs.readFileSync(path.join(frontendRoot, "src/kernel/route-resolver.ts"), "utf8")
const adminFn = resolver.slice(
  resolver.indexOf("export function resolveAdminRoute"),
  resolver.indexOf("export function resolveSiteRoute"),
)
assert.doesNotMatch(adminFn, /isSubmoduleEnabled/)
assert.match(adminFn, /resolveAdminRoute\(segments: string\[\]\)/)

const dashboardPage = fs.readFileSync(
  path.join(frontendRoot, "modules/core/admin/dashboard-page.tsx"),
  "utf8",
)
assert.doesNotMatch(dashboardPage, /next-intl\/server/)
assert.match(dashboardPage, /readRequestLocale/)

assert.equal(fs.existsSync(path.join(frontendRoot, "src/middleware.ts")), true)
assert.equal(fs.existsSync(path.join(frontendRoot, "middleware.ts")), false)

const middleware = fs.readFileSync(path.join(frontendRoot, "src/middleware.ts"), "utf8")
assert.match(middleware, /Authorization = `Bearer \$\{token\}`/)
assert.doesNotMatch(middleware, /Cookie: request\.headers\.get\("cookie"\)/)

console.log("build-admin-nav.smoke.mjs OK")
