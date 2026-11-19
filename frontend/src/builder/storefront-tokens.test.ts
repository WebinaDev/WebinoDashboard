import { test } from "node:test"
import assert from "node:assert/strict"

import { AA_CONTRAST, contrastRatio, LIGHT_INK } from "./render/contrast.ts"
import { storefrontColorAliases } from "./storefront-tokens.ts"

const lightColors = {
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
}

const aliColors = {
  ...lightColors,
  primary: "#8f2f4b",
  secondary: "#3a0f1f",
  text: "#fff4ef",
  accent: "#d4aa69",
  background: "#35121f",
  surface: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.16)",
  muted: "#e2cfd4",
}

const forms = {
  radius: "12px",
  labelColor: "#fff4ef",
  fieldBackground: "rgba(255,255,255,0.07)",
  borderColor: "rgba(255,255,255,0.16)",
  focusColor: "#d4aa69",
  errorColor: "#C2414A",
  padding: "0.65rem 0.75rem",
}

test("dark glass theme aliases Tailwind tokens to builder colours and drops unreadable primary", () => {
  const vars = storefrontColorAliases(aliColors, forms)
  assert.equal(vars["--color-foreground"], "#fff4ef")
  assert.equal(vars["--color-muted-foreground"], "#e2cfd4")
  assert.equal(vars["--color-background"], "#35121f")
  // Brand maroon fails AA on the dark ground; gold accent is used for text-primary / kickers.
  assert.equal(vars["--color-primary"], "#d4aa69")
  assert.equal(vars["--wbx-accent"], "#d4aa69")
  assert.equal(vars["--wbx-ink"], "#fff4ef")
  assert.equal(vars["color-scheme"], "dark")
  assert.ok((contrastRatio(vars["--color-foreground"], vars["--color-background"]) ?? 0) >= AA_CONTRAST)
  assert.ok((contrastRatio(vars["--color-primary"], vars["--color-background"]) ?? 0) >= AA_CONTRAST)
  assert.ok((contrastRatio(vars["--color-muted-foreground"], vars["--color-background"]) ?? 0) >= AA_CONTRAST)
})

test("navy magazine ink on a dark background is replaced, without using a blue fallback", () => {
  const vars = storefrontColorAliases({ ...aliColors, text: "#021959", muted: "#4d5e8a" }, forms)
  assert.notEqual(vars["--color-foreground"].toLowerCase(), "#021959")
  assert.notEqual(vars["--color-muted-foreground"].toLowerCase(), "#4d5e8a")
  assert.equal(vars["--color-foreground"], LIGHT_INK)
  assert.ok((contrastRatio(vars["--color-foreground"], "#35121f") ?? 0) >= AA_CONTRAST)
  assert.ok((contrastRatio(vars["--color-muted-foreground"], "#35121f") ?? 0) >= AA_CONTRAST)
  assert.equal(vars["--wb-color-text"], LIGHT_INK)
})

test("light magazine defaults keep navy ink and brand primary", () => {
  const vars = storefrontColorAliases(lightColors, { ...forms, labelColor: "#021959" })
  assert.equal(vars["--color-foreground"], "#021959")
  assert.equal(vars["--color-primary"], lightColors.primary)
  assert.equal(vars["--wbx-accent"], lightColors.primary)
  assert.equal(vars["color-scheme"], undefined)
})
