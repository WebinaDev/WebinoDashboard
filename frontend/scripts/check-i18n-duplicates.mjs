#!/usr/bin/env node
/**
 * Fails when a messages/*.json object declares the same key twice
 * (JSON.parse silently keeps the last one, hiding the earlier translation).
 * Run: node scripts/check-i18n-duplicates.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const messagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../messages")

function findDuplicates(text) {
  const duplicates = []
  const stack = []
  const keyPath = []
  let i = 0
  let line = 1

  const skipString = () => {
    let out = ""
    i++
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        out += text[i] + text[i + 1]
        i += 2
        continue
      }
      if (text[i] === "\n") line++
      out += text[i++]
    }
    i++
    return JSON.parse(`"${out}"`)
  }

  const nextNonSpace = () => {
    let j = i
    while (j < text.length && /\s/.test(text[j])) j++
    return text[j]
  }

  while (i < text.length) {
    const ch = text[i]
    if (ch === "\n") {
      line++
      i++
    } else if (ch === "{") {
      stack.push({ type: "object", keys: new Set() })
      i++
    } else if (ch === "[") {
      stack.push({ type: "array" })
      i++
    } else if (ch === "}" || ch === "]") {
      stack.pop()
      if (stack.at(-1)?.type === "object") keyPath.pop()
      i++
    } else if (ch === '"') {
      const startLine = line
      const value = skipString()
      const top = stack.at(-1)
      if (top?.type === "object" && nextNonSpace() === ":") {
        if (top.keys.has(value)) {
          duplicates.push({ key: [...keyPath, value].join("."), line: startLine })
        }
        top.keys.add(value)
        while (text[i] !== ":") i++
        i++
        while (/\s/.test(text[i])) {
          if (text[i] === "\n") line++
          i++
        }
        if (text[i] === "{" || text[i] === "[") {
          keyPath.push(value)
        }
      }
    } else {
      i++
    }
  }
  return duplicates
}

let failed = false
for (const file of fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json")).sort()) {
  const text = fs.readFileSync(path.join(messagesDir, file), "utf8")
  JSON.parse(text)
  const duplicates = findDuplicates(text)
  for (const d of duplicates) {
    console.error(`messages/${file}:${d.line} duplicate key "${d.key}"`)
  }
  failed ||= duplicates.length > 0
}

if (failed) {
  process.exit(1)
}
console.log("check-i18n-duplicates.mjs OK")
