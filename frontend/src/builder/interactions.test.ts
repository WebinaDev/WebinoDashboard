import assert from "node:assert/strict"
import { test } from "node:test"

import { interactionAttrs, sanitizeInteractions } from "./interactions"

test("interactions: drops malformed entries and selector injection", () => {
  const out = sanitizeInteractions([
    { trigger: "click", action: "toggle", target: "#menu" },
    { trigger: "click", action: "toggleClass", target: "x", className: "a b" },
    { trigger: "evil", action: "show" },
    { trigger: "hover", action: "addClass", className: "is-on" },
    { trigger: "click", action: "scrollTo" },
    { trigger: "click", action: "hide", target: "a,b" },
  ])
  assert.deepEqual(out, [
    { trigger: "click", action: "toggle", target: "menu" },
    { trigger: "hover", action: "addClass", className: "is-on" },
  ])
})

test("interactions: data attribute only when non-empty", () => {
  assert.deepEqual(interactionAttrs([]), {})
  assert.match(interactionAttrs([{ trigger: "inview", action: "addClass", className: "seen" }])["data-wb-ix"], /seen/)
})
