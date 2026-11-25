// Runs the real route resolver for every accounting/* path both manifests claim,
// and prints which module/page actually answers.
import { MODULE_MANIFESTS } from "../src/kernel/registry.ts";
import { resolveAdminRoute } from "../src/kernel/route-resolver.ts";

const claimants = MODULE_MANIFESTS.filter((m) =>
  (m.adminRoutes ?? []).some((r) => String(r.path).startsWith("accounting")),
);

console.log("manifests claiming accounting/* paths:");
for (const m of claimants) {
  const n = (m.adminRoutes ?? []).filter((r) => String(r.path).startsWith("accounting")).length;
  console.log(`  ${m.slug.padEnd(12)} ${n} routes   (registry index ${MODULE_MANIFESTS.indexOf(m)})`);
}

// every distinct accounting path, in registry order
const paths = [];
const seen = new Set();
for (const m of claimants) {
  for (const r of m.adminRoutes ?? []) {
    const p = String(r.path);
    if (!p.startsWith("accounting")) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    paths.push(p);
  }
}

console.log(`\ndistinct accounting/* paths: ${paths.length}\n`);
console.log("path".padEnd(30) + "winner module".padEnd(14) + "page");
console.log("-".repeat(70));

const tally = {};
let unresolved = 0;
for (const p of paths) {
  const segs = p.split("/").filter(Boolean);
  const res = resolveAdminRoute(segs);
  if (!res) {
    console.log(p.padEnd(30) + "UNRESOLVED");
    unresolved++;
    continue;
  }
  tally[res.moduleSlug] = (tally[res.moduleSlug] ?? 0) + 1;
  console.log(p.padEnd(30) + res.moduleSlug.padEnd(14) + (res.page ?? res.submodule ?? "-"));
}

console.log("-".repeat(70));
console.log("\nresolved by module:", JSON.stringify(tally));
console.log("unresolved:", unresolved);

// do the winner pages exist on disk?
import fs from "node:fs";
console.log("\npage files exist for every resolved ERP route?");
let missing = 0;
for (const p of paths) {
  const res = resolveAdminRoute(p.split("/").filter(Boolean));
  if (!res) continue;
  const file = `modules/${res.moduleSlug}/admin/${res.page ?? res.submodule}-page.tsx`;
  if (!fs.existsSync(file)) {
    console.log(`  MISSING ${file}   (for ${p})`);
    missing++;
  }
}
console.log(missing === 0 ? "  ok all resolved pages exist on disk" : `  ${missing} missing`);
