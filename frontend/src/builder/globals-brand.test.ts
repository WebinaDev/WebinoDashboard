import assert from "node:assert/strict"
import { test } from "node:test"

import {
  applyBrandColors,
  colorsAreUnsetOrSeed,
  SEED_GLOBAL_COLORS,
  type BrandColorSource,
} from "./globals-brand.ts"
import type { BuilderGlobals } from "./globals.ts"

const catalog: BuilderGlobals = {
  colors: {
    primary: "#e775ae",
    secondary: "#021959",
    text: "#021959",
    accent: "#dc5f9d",
    background: "#ffffff",
    surface: "#f3f5f8",
    border: "#e8edf3",
    muted: "#4d5e8a",
    success: "#1F8A70",
    danger: "#C2414A",
  },
  typography: { link: { fontSize: "0.95rem", fontWeight: "600", lineHeight: "1.5", color: "#dc5f9d" } },
  buttons: {
    variants: {
      primary: { background: "#e775ae", color: "#FFFFFF", hoverBackground: "#cb6799", hoverColor: "#FFFFFF", border: "transparent" },
      secondary: { background: "#021959", color: "#FFFFFF", hoverBackground: "#02164e", hoverColor: "#FFFFFF", border: "transparent" },
      outline: { background: "transparent", color: "#021959", hoverBackground: "#ffffff", hoverColor: "#021959", border: "#e8edf3" },
      ghost: { background: "transparent", color: "#021959", hoverBackground: "#ffffff", hoverColor: "#dc5f9d", border: "transparent" },
    },
  },
  forms: { labelColor: "#021959", fieldBackground: "#f3f5f8", borderColor: "#e8edf3", focusColor: "#dc5f9d" },
  layout: { background: "#ffffff" },
  palette: [
    { id: "primary", name: "اصلی", value: "#e775ae" },
    { id: "secondary", name: "ثانویه", value: "#021959" },
    { id: "background", name: "پس‌زمینه", value: "#ffffff" },
    { id: "text", name: "متن", value: "#021959" },
  ],
} as unknown as BuilderGlobals

function merged(incoming: { colors?: Record<string, string> } = {}): BuilderGlobals {
  return { ...catalog, colors: { ...catalog.colors, ...(incoming.colors ?? {}) } }
}

test("empty or seed colors derive from the brand palette", () => {
  const brand: BrandColorSource = {
    palette: {
      primary: "#1B6BC4",
      secondary: "#0D3D7A",
      accent: "#5BA8E8",
      bg: "#EEF4FB",
      surface: "#FFFFFF",
      text: "#0D2B4A",
      muted: "#5A7390",
      border: "#D7E6F7",
    },
  }
  const fromEmpty = applyBrandColors(merged(), brand, { customCode: [] }, catalog)
  assert.equal(fromEmpty.colors.primary, "#1b6bc4")
  assert.equal(fromEmpty.colors.accent, "#5ba8e8")
  assert.equal(fromEmpty.forms.focusColor, "#5ba8e8")
  assert.equal(fromEmpty.layout.background, "#eef4fb")

  const fromSeed = applyBrandColors(merged({ colors: { ...SEED_GLOBAL_COLORS } }), brand, { colors: { ...SEED_GLOBAL_COLORS } }, catalog)
  assert.equal(fromSeed.colors.primary, "#1b6bc4")
  assert.equal(fromSeed.colors.secondary, "#0d3d7a")
})

test("explicit custom colors are kept", () => {
  const incoming = { colors: { primary: "#112233", accent: "#445566" } }
  const out = applyBrandColors(merged(incoming), { palette: { primary: "#1B6BC4" } }, incoming, catalog)
  assert.equal(out.colors.primary, "#112233")
  assert.equal(out.colors.accent, "#445566")
  assert.equal(out.colors.secondary.toLowerCase(), catalog.colors.secondary.toLowerCase())
})

test("appearance fills gaps when the style palette is empty", () => {
  const out = applyBrandColors(merged(), {
    appearance: { primary_color: "#1A8AAA", accent_color: "#2BB0C7", secondary_color: "#0B1F33" },
  }, {}, catalog)
  assert.equal(out.colors.primary, "#1a8aaa")
  assert.equal(out.colors.accent, "#2bb0c7")
  assert.equal(out.colors.secondary, "#0b1f33")
})

test("seed detection is case-insensitive", () => {
  assert.equal(colorsAreUnsetOrSeed({}), true)
  assert.equal(colorsAreUnsetOrSeed({ primary: "#e16ba6", accent: "#E16BA6" }), true)
  assert.equal(colorsAreUnsetOrSeed({ primary: "#112233" }), false)
})
