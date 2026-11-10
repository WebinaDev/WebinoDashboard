import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { GATEWAY_CATEGORIES } from "./payment-gateway-ids.ts"

const root = new URL("../../", import.meta.url)
const fa = JSON.parse(readFileSync(new URL("messages/fa.json", root), "utf8"))
const en = JSON.parse(readFileSync(new URL("messages/en.json", root), "utf8"))
const config = readFileSync(new URL("../backend/config/payment_gateways.php", root), "utf8")

function configIds(): string[] {
  const body = config.slice(config.indexOf("'gateways' =>"))
  return [...body.matchAll(/^ {8}'([a-z0-9_]+)' => \[/gm)].map((m) => m[1])
}

test("every backend gateway id is mirrored on the frontend", () => {
  const ids = configIds()
  assert.ok(ids.length > 20)
  for (const id of ids) assert.ok(id in GATEWAY_CATEGORIES, `missing GATEWAY_CATEGORIES.${id}`)
})

test("every gateway has a Persian and English label (no raw ids)", () => {
  for (const id of Object.keys(GATEWAY_CATEGORIES)) {
    const faLabel = fa.payments_hub?.[id]
    const enLabel = en.payments_hub?.[id]
    assert.ok(typeof faLabel === "string" && faLabel && faLabel !== id, `fa payments_hub.${id}`)
    assert.ok(typeof enLabel === "string" && enLabel, `en payments_hub.${id}`)
    assert.ok(!faLabel.includes("—"), `no em dash in fa payments_hub.${id}`)
  }
})
