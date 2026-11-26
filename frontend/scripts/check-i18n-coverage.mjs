#!/usr/bin/env node
/**
 * Reports translation keys used by the given module folders that are missing from
 * messages/fa.json or messages/en.json.
 *
 * `check-i18n-duplicates.mjs` guards against the same key appearing twice in one file;
 * nothing guarded against a page calling `t("never_added")`, which next-intl renders as
 * the raw key path in the UI. That is what this catches.
 *
 * Resolution matters: a file may hold several translators, each bound to a different
 * namespace, so keys are resolved per variable rather than assumed to be root-relative.
 *
 * Usage:
 *   node scripts/check-i18n-coverage.mjs [dir ...]
 *   node scripts/check-i18n-coverage.mjs --fix-writes-candidates
 *
 * Defaults to modules/cafe and modules/accounting.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const args = process.argv.slice(2);
const targets = args.filter((a) => !a.startsWith("--"));
const dirs = (targets.length ? targets : ["modules/cafe", "modules/accounting"]).map((d) =>
  path.resolve(root, d),
);

function load(locale) {
  return JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
}

const fa = load("fa");
const en = load("en");

/** Resolve "a.b.c" against a nested object; returns undefined when any segment is absent. */
function lookup(obj, key) {
  let cur = obj;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Map each translator variable in a file to its namespace.
 *
 * `const t = useTranslations()` -> root, so keys are used verbatim.
 * `const t = useTranslations("cafe_admin.pos")` -> keys are prefixed.
 */
function translators(src) {
  const map = new Map();
  const re = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g;
  let m;
  while ((m = re.exec(src))) map.set(m[1], m[2] ?? m[3] ?? "");
  // `useTranslations("ns")` called inline: `useTranslations("x")("key")`
  return map;
}

const missing = new Map(); // key -> { fa: bool, en: bool, files: Set }
let totalCalls = 0;
let unresolvedVars = 0;

for (const dir of dirs) {
  for (const file of walk(dir)) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("useTranslations")) continue;
    const vars = translators(src);
    const rel = path.relative(root, file);

    // var("key")  — also catches var(`key`) with no interpolation
    const callRe = /\b(\w+)\(\s*(["'`])([^"'`$]*)\2\s*[,)]/g;
    let m;
    while ((m = callRe.exec(src))) {
      const [, name, , rawKey] = m;
      if (!vars.has(name)) continue;
      const key = rawKey.trim();
      if (!key) continue;
      totalCalls++;
      const full = vars.get(name) ? `${vars.get(name)}.${key}` : key;

      const inFa = lookup(fa, full) !== undefined;
      const inEn = lookup(en, full) !== undefined;
      if (inFa && inEn) continue;

      if (!missing.has(full)) missing.set(full, { fa: inFa, en: inEn, files: new Set() });
      missing.get(full).files.add(rel);
    }

    // direct useTranslations("ns")("key") form
    const inlineRe = /useTranslations\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)\s*\(\s*(["'`])([^"'`$]*)\3/g;
    while ((m = inlineRe.exec(src))) {
      const ns = m[1] ?? m[2] ?? "";
      const key = m[4].trim();
      if (!key) continue;
      totalCalls++;
      const full = ns ? `${ns}.${key}` : key;
      const inFa = lookup(fa, full) !== undefined;
      const inEn = lookup(en, full) !== undefined;
      if (inFa && inEn) continue;
      if (!missing.has(full)) missing.set(full, { fa: inFa, en: inEn, files: new Set() });
      missing.get(full).files.add(rel);
    }
  }
}

const keys = [...missing.keys()].sort();
const bothMissing = keys.filter((k) => !missing.get(k).fa && !missing.get(k).en);
const faOnly = keys.filter((k) => !missing.get(k).fa && missing.get(k).en);
const enOnly = keys.filter((k) => !missing.get(k).en && missing.get(k).fa);

console.log(`t() calls resolved: ${totalCalls}`);
console.log(`keys missing a translation: ${keys.length}`);
console.log(`  missing in BOTH fa and en: ${bothMissing.length}`);
console.log(`  missing in fa only:        ${faOnly.length}`);
console.log(`  missing in en only:        ${enOnly.length}`);

if (process.env.I18N_VERBOSE === "1") {
  console.log("");
  for (const k of keys) {
    const e = missing.get(k);
    const where = e.fa ? "fa" : e.en ? "en" : "fa+en";
    console.log(`  [${where}] ${k}   (${[...e.files].slice(0, 2).join(", ")})`);
  }
}

// Group by top-level namespace so the work can be split up.
const byNs = new Map();
for (const k of keys) {
  const ns = k.split(".")[0];
  byNs.set(ns, (byNs.get(ns) ?? 0) + 1);
}
console.log("");
console.log("missing by top-level group:");
for (const [ns, n] of [...byNs].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)}  ${ns}`);
}

process.exit(keys.length > 0 && process.env.I18N_STRICT === "1" ? 1 : 0);
