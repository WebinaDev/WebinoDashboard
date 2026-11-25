// Build the admin nav with accounting activated and report what shows up.
import { buildAdminNav } from "../src/kernel/route-resolver.ts";

const acts = [];
const on = (m, s) => acts.push({ module_slug: m, submodule_slug: s ?? null, enabled: true, licensed: true });
for (const s of ["dashboard","persons","products","invoices","journals","ledger","reports","cash","checks","receipts","warehouses","settings"]) on("accounting", s);
on("accounting", null);
for (const s of ["catalog","orders","accounting"]) on("commerce", s);
on("commerce", null);
on("core", "dashboard"); on("core", null);

const nav = buildAdminNav(acts);
const flat = [];
(function walk(items) {
  for (const it of items ?? []) {
    if (it.url) flat.push(it);
    if (it.items) walk(it.items);
  }
})(nav.flatMap((s) => s.items ?? []));

const acc = flat.filter((i) => String(i.url).includes("accounting"));
console.log(`nav items total: ${flat.length}   containing "accounting": ${acc.length}`);

const byUrl = new Map();
for (const i of acc) byUrl.set(i.url, (byUrl.get(i.url) ?? 0) + 1);
const dupes = [...byUrl].filter(([, n]) => n > 1);
console.log(`duplicate accounting URLs in nav: ${dupes.length}`);
for (const [u, n] of dupes) console.log(`  x ${u} appears ${n}x`);

console.log("\naccounting nav links:");
for (const i of acc) console.log(`  ${String(i.url).padEnd(34)} ${i.label ?? i.labelKey ?? ""}`);
