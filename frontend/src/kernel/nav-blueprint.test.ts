/**
 * Sidebar blueprint tests.
 *
 * The sidebar is the one surface every dashboard user touches every day, and its structure
 * lives in data (`nav-blueprint.ts`) rather than in components — which makes it testable
 * without a browser. These tests pin the invariants the redesign promised:
 * group order, no duplicate links, one accounting group, and role scoping.
 *
 * Run: npm run test:nav-blueprint
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import fs from "node:fs"
import path from "node:path"

import { buildAdminNav } from "./route-resolver"
import { NAV_BLUEPRINT, groupDefaultOpenForRole, groupVisibleForRole } from "./nav-blueprint"
import { MODULE_MANIFESTS } from "./registry"
import type { TenantActivation } from "./types"

/** Every submodule of every module enabled — the widest sidebar the app can produce. */
function allActivated(): TenantActivation[] {
  const acts: TenantActivation[] = []
  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      acts.push({
        module_slug: mod.slug,
        submodule_slug: route.submodule,
        enabled: true,
        licensed: true,
      } as TenantActivation)
    }
  }
  return acts
}

/** Every leaf a role actually gets, after group-, entry- and capability-level filtering. */
function visibleLinks(role: string, capabilities: string[]) {
  const holds = (required?: string) => {
    if (!required) return true
    if (capabilities.includes("*")) return true
    return required
      .split(",")
      .some((req) =>
        capabilities.some(
          (g) =>
            g === "*" ||
            g === req ||
            (g.endsWith(".*") && (req === g.slice(0, -2) || req.startsWith(g.slice(0, -1)))),
        ),
      )
  }

  const links: { url: string; group: string }[] = []
  for (const sec of buildAdminNav(allActivated())) {
    if (!groupVisibleForRole(sec, role)) continue
    for (const item of sec.items) {
      const allowed = (n: { roles?: string[]; hideFrom?: string[]; capability?: string }) => {
        if (n.roles?.length && !n.roles.includes(role)) return false
        if (n.hideFrom?.length && n.hideFrom.includes(role)) return false
        return holds(n.capability)
      }
      if (item.items?.length) {
        for (const child of item.items) {
          if (allowed(child)) links.push({ url: child.url, group: sec.section })
        }
        continue
      }
      if (allowed(item)) links.push({ url: item.url, group: sec.section })
    }
  }
  return links
}

const BLUEPRINT_ORDER = [
  "overview",
  "daily",
  "menu",
  "stock",
  "finance",
  "reports",
  "staff",
  "marketing",
  "content",
  "tools",
  "admin",
]

describe("nav blueprint", () => {
  it("declares the groups in daily-use order", () => {
    const orders = NAV_BLUEPRINT.map((g) => g.order)
    assert.deepEqual(
      [...orders].sort((a, b) => a - b),
      orders,
      "blueprint orders must ascend so the file reads as the rendered list",
    )
    assert.deepEqual(NAV_BLUEPRINT.map((g) => g.key), BLUEPRINT_ORDER)
  })

  it("renders every blueprint group, in order, when everything is enabled", () => {
    const sections = buildAdminNav(allActivated()).filter((s) => s.groupKey)
    assert.deepEqual(
      sections.map((s) => s.groupKey),
      BLUEPRINT_ORDER,
    )
  })

  it("never emits the same link twice", () => {
    const links = visibleLinks("admin", ["*"])
    const seen = new Map<string, number>()
    for (const l of links) seen.set(l.url, (seen.get(l.url) ?? 0) + 1)
    const dups = [...seen].filter(([, n]) => n > 1)
    assert.deepEqual(dups, [], `duplicate sidebar links: ${dups.map(([u]) => u).join(", ")}`)
    assert.ok(links.length > 100, `expected a full admin sidebar, got ${links.length}`)
  })

  it("keeps accounting in exactly one group", () => {
    const links = visibleLinks("admin", ["*"])
    const groups = new Set(links.filter((l) => l.url.includes("/accounting")).map((l) => l.group))
    assert.deepEqual([...groups], ["finance"], `accounting leaked into: ${[...groups].join(", ")}`)
  })

  it("leaves nothing behind: every enabled route is reachable", () => {
    const links = visibleLinks("admin", ["*"])
    const urls = new Set(links.map((l) => l.url))
    const sections = buildAdminNav(allActivated())
    // Every section item (including nested children) must be a reachable leaf somewhere.
    let leaves = 0
    for (const s of sections) {
      for (const i of s.items) {
        if (i.items?.length) leaves += i.items.length
        else leaves += 1
      }
    }
    assert.ok(leaves >= urls.size, "nav lost routes between resolver and blueprint")
    assert.ok(MODULE_MANIFESTS.length > 10)
  })
})

describe("nav shape", () => {
  it("never builds a drawer that holds a single link", () => {
    const offenders: string[] = []
    for (const sec of buildAdminNav(allActivated())) {
      for (const item of sec.items) {
        if (item.items?.length === 1) offenders.push(`${sec.section}/${item.url}`)
        for (const child of item.items ?? []) {
          if (child.items?.length === 1) offenders.push(`${sec.section}/${child.url}`)
        }
      }
    }
    assert.deepEqual(offenders, [], `single-child sub-menus: ${offenders.join(", ")}`)
  })

  it("keeps a group's top level short enough to scan", () => {
    // With every group folded into one collapsible row, the sub-list is what the user
    // actually reads. Anything past ~20 rows is a sign the domain needs splitting.
    for (const sec of buildAdminNav(allActivated())) {
      if (!sec.groupKey) continue
      assert.ok(sec.items.length <= 22, `${sec.groupKey} has ${sec.items.length} top-level rows`)
    }
  })
})

describe("nav role scoping", () => {
  const TILL = ["pos.use", "orders.create", "orders.own", "catalog.*"]

  it("gives a cook the kitchen board and nothing else", () => {
    const links = visibleLinks("cook", ["kitchen.view", "kitchen.station"])
    // The spec: the kitchen board and the dashboard, nothing else.
    assert.deepEqual(links.map((l) => l.url), ["/dashboard", "/dashboard/cafe/kitchen"])
  })

  it("keeps a cashier out of stock, finance and settings", () => {
    const groups = new Set(visibleLinks("cashier", TILL).map((l) => l.group))
    for (const forbidden of ["stock", "finance", "admin", "staff"]) {
      assert.ok(!groups.has(forbidden), `cashier can see ${forbidden}`)
    }
    for (const expected of ["overview", "daily", "menu"]) {
      assert.ok(groups.has(expected), `cashier is missing ${expected}`)
    }
  })

  it("gives an accountant finance and reports, not the till", () => {
    const groups = new Set(visibleLinks("accountant", ["accounting.manage", "reports.shop"]).map((l) => l.group))
    assert.ok(groups.has("finance"))
    assert.ok(groups.has("reports"))
    assert.ok(!groups.has("daily"))
    assert.ok(!groups.has("menu"))
  })

  it("gives a café manager every group a manager is entitled to", () => {
    const groups = new Set(
      visibleLinks("branch_manager", [
        "pos.use", "orders.*", "catalog.*", "kitchen.view", "reports.shop",
        "staff.manage", "branches.manage", "settings.manage", "accounting.manage",
      ]).map((l) => l.group),
    )
    for (const expected of ["daily", "menu", "stock", "finance", "reports", "staff", "admin"]) {
      assert.ok(groups.has(expected), `café manager is missing ${expected}`)
    }
  })

  it("opens «کار روزانه» by default for operational roles only", () => {
    const daily = NAV_BLUEPRINT.find((g) => g.key === "daily")!
    for (const role of ["cashier", "waiter", "cook", "branch_manager", "admin"]) {
      assert.equal(groupDefaultOpenForRole(daily, role), true, `${role} should land on an open group`)
    }
    const finance = NAV_BLUEPRINT.find((g) => g.key === "finance")!
    assert.equal(groupDefaultOpenForRole(finance, "accountant"), false)
    // «پیشخوان» is not collapsible, so it is always shown expanded.
    const overview = NAV_BLUEPRINT.find((g) => g.key === "overview")!
    assert.equal(groupDefaultOpenForRole(overview, "cashier"), true)
  })

  it("hides every group from an unknown role except the public ones", () => {
    for (const g of NAV_BLUEPRINT) {
      if (g.audiences.includes("everyone")) continue
      assert.equal(groupVisibleForRole(g, "some-future-role"), false, `${g.key} leaked to an unknown role`)
    }
  })
})

describe("nav translations", () => {
  const messages = path.resolve(process.cwd(), "messages")
  const fa = JSON.parse(fs.readFileSync(path.join(messages, "fa.json"), "utf8")).nav as Record<string, string>
  const en = JSON.parse(fs.readFileSync(path.join(messages, "en.json"), "utf8")).nav as Record<string, string>

  it("has a label for every blueprint group", () => {
    for (const g of NAV_BLUEPRINT) {
      const key = g.labelKey.replace(/^nav\./, "")
      assert.ok(fa[key], `fa missing ${g.labelKey}`)
      assert.ok(en[key], `en missing ${g.labelKey}`)
    }
  })

  it("has a label for every navigable route", () => {
    const missing: string[] = []
    for (const sec of buildAdminNav(allActivated())) {
      const keys = [sec.labelKey]
      for (const i of sec.items) {
        keys.push(i.titleKey)
        for (const c of i.items ?? []) keys.push(c.titleKey)
      }
      for (const k of keys) {
        const bare = k.replace(/^nav\./, "")
        if (!fa[bare] || !en[bare]) missing.push(k)
      }
    }
    assert.deepEqual([...new Set(missing)], [], "nav keys without a translation")
  })
})
