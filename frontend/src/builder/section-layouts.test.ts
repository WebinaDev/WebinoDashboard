import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { POETRY_WIDGETS } from "./registry-poetry"
import { aboutClass, heroIsOverlay, shopNarrowSpv, shopNarrowStyle, shopTrackClass } from "./render/poetry-layouts"
import { ESLIMI_PATTERN_URL, patternOn, patternVars, sectionExtraClass, sectionIsFullBleed } from "./render/section-extras"

test("section fullBleed: off by default, only for desktopWidth=full", () => {
  assert.equal(sectionIsFullBleed({}), false)
  assert.equal(sectionIsFullBleed({ fullBleed: true }), true)
  assert.equal(sectionIsFullBleed({ fullBleed: true }, "half"), false)
  assert.equal(sectionExtraClass({}), "")
  assert.equal(sectionExtraClass({ fullBleed: true, pattern: { enabled: true } }), "wb-full-bleed wb-has-pattern")
})

test("section pattern: defaults, clamping and unsafe colours", () => {
  assert.equal(patternOn(undefined), false)
  assert.equal(patternOn({ opacity: 50 }), false)
  const d = patternVars({ enabled: true }) as Record<string, string>
  assert.deepEqual(d, { "--wb-pat-op": "0.12", "--wb-pat-color": "#c9a45c", "--wb-pat-size": "96px" })
  const v = patternVars({ enabled: true, opacity: 250, color: "red;}body{x", scale: 5 }) as Record<string, string>
  assert.equal(v["--wb-pat-op"], "1")
  assert.equal(v["--wb-pat-color"], "#c9a45c")
  assert.equal(v["--wb-pat-size"], "24px")
  assert.equal((patternVars({ color: "var(--wb-color-primary)" }) as Record<string, string>)["--wb-pat-color"], "var(--wb-color-primary)")
  const svg = readFileSync(join(process.cwd(), "public", ESLIMI_PATTERN_URL), "utf8")
  assert.ok(svg.startsWith("<svg") && svg.length < 2048 && !svg.includes("base64"))
})

test("poetry layouts: backward-compatible defaults", () => {
  assert.equal(heroIsOverlay({}), false)
  assert.equal(heroIsOverlay({ heroLayout: "overlay" }), true)
  assert.equal(aboutClass({}), "wpz-about")
  assert.equal(aboutClass({ aboutLayout: "horizontal", card: "light" }), "wpz-about wpz-about-h wpz-card-light")
  assert.equal(shopNarrowSpv({}), 0)
  assert.equal(shopTrackClass({}), "")
  assert.deepEqual(shopNarrowStyle({}), {})
  assert.equal(shopNarrowSpv({ slidesNarrow: 9 }), 4)
  assert.equal(shopTrackClass({ slidesNarrow: 3, compactCards: true, imageFit: "contain" }), "wpz-cq wpz-compact wpz-fit-contain")
  assert.deepEqual(shopNarrowStyle({ slidesNarrow: 3 }), { "--wpz-spv-n": "3" })
})

test("registry exposes the new Persian controls", () => {
  const keys = (t: string) => POETRY_WIDGETS.find((d) => d.type === t)!.fields.map((f) => ("key" in f ? f.key : ""))
  for (const k of ["heroLayout", "decorLeft", "decorLeftFrame", "decorRight", "decorRightFrame", "heroVeil", "fullBleed"]) assert.ok(keys("poetry-hero").includes(k), k)
  for (const k of ["aboutLayout", "card"]) assert.ok(keys("poet-about").includes(k), k)
  for (const k of ["slidesNarrow", "compactCards", "imageFit"]) assert.ok(keys("shop-showcase").includes(k), k)
  // create() defaults unchanged (no new keys forced onto existing/new nodes)
  assert.equal(POETRY_WIDGETS.find((d) => d.type === "poetry-hero")!.create().props.heroLayout, undefined)
})
