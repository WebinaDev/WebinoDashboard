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
assert.match(marketing, /section:\s*"commerce"/)
assert.match(marketing, /path:\s*"notifications"/)
assert.match(users, /path:\s*"tickets"/)
assert.match(users, /path:\s*"support"/)
assert.match(analytics, /section:\s*"reports"/)
assert.match(analytics, /navGroup:\s*"performance"/)
assert.match(core, /navHidden:\s*true/s)
assert.match(core, /section:\s*"tools"/)
assert.match(core, /settings\/site\/security/)
assert.match(core, /navGroup:\s*"media"/)
assert.match(core, /section:\s*"content"/)
assert.match(core, /path:\s*"media\/folders"/)
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
assert.match(layout, /p-3 pt-3 sm:gap-4 sm:p-4 sm:pt-4/)
assert.doesNotMatch(layout, /pt-0 sm:pt-0/)
assert.doesNotMatch(layout, /p-3 pt-0/)

console.log("build-admin-nav.smoke.mjs OK")
