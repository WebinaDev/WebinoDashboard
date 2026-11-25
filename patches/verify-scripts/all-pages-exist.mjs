// Every admin route in every manifest must have the page file loadAdminPage imports:
// modules/{moduleSlug}/admin/{page ?? submodule}-page.tsx
import fs from "node:fs";
import { MODULE_MANIFESTS } from "../src/kernel/registry.ts";

let total = 0;
const missing = [];
for (const m of MODULE_MANIFESTS) {
  for (const r of m.adminRoutes ?? []) {
    if (!r.path) continue;
    total++;
    const name = r.page ?? r.submodule;
    if (!name) { missing.push([m.slug, r.path, "(no page or submodule)"]); continue; }
    const file = `modules/${m.slug}/admin/${name}-page.tsx`;
    if (!fs.existsSync(file)) missing.push([m.slug, r.path, file]);
  }
}

console.log(`admin routes checked: ${total}   missing page files: ${missing.length}`);
for (const [slug, p, f] of missing) console.log(`  x ${slug}  ${p}  ->  ${f}`);
if (missing.length === 0) console.log("  ok every admin route has its page file");
