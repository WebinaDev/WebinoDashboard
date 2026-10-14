import assert from "node:assert/strict"
import { test } from "node:test"

import { applyPreset, componentsCss, detachInstance, instanceWidget, makeComponent, remapIds, resolveInstance, updateComponentSections } from "./components.ts"
import { designSystemCss, variablesCss } from "./globals.ts"
import { advancedAttrs, advancedClass, documentCss, scopedCss, styleToCss } from "./style.ts"
import type { SectionNode } from "./types.ts"

const sections: SectionNode[] = [
  { id: "s1", columns: [{ id: "c1", span: 12, widgets: [{ id: "h1", type: "heading", props: { text: "Hi", tag: "h2" }, style: { base: { color: "red" } } }] }] },
] as unknown as SectionNode[]

test("component instance applies variant and exposed overrides", () => {
  const comp = { ...makeComponent("Card", sections, []), sections, props: [{ key: "title", label: "T", widget: "h1", prop: "text" }] }
  const g = { components: [comp] }
  const out = resolveInstance(g, { component: comp.id, overrides: { title: "سلام" } })
  assert.equal(out?.[0].columns[0].widgets[0].props.text, "سلام")
  assert.equal(resolveInstance(g, { component: "nope" }), null)
  assert.match(componentsCss([{ id: "p", columns: [{ id: "pc", span: 12, widgets: [instanceWidget("i1", comp.id)] }] }] as unknown as SectionNode[], g), /wb-h1\{color:red/)
  const withVariant = updateComponentSections([comp], comp.id, [], "Dark")
  assert.equal(withVariant[0].variants?.[0].name, "Dark")
  assert.deepEqual(resolveInstance({ components: withVariant }, { component: comp.id, variant: withVariant[0].variants?.[0].id }), [])
})

test("detach keeps an id map so edits can be pushed back to the master", () => {
  const comp = { id: "card", name: "Card", sections, props: [] }
  const detached = detachInstance(instanceWidget("i1", "card"), { components: [comp] })
  assert.ok(detached?.children)
  assert.notEqual(detached!.children![0].id, "s1")
  const back = remapIds(detached!.children!, detached!.props.componentMap as Record<string, string>)
  assert.equal(back[0].id, "s1")
  assert.equal(back[0].columns[0].widgets[0].id, "h1")
})

test("presets, classes, variables and safe custom css/attributes", () => {
  const presets = [{ id: "big", name: "Big", widget: "heading", style: { base: { fontSize: "40px" } }, props: { tag: "h1", text: "x" } }]
  const w = applyPreset({ id: "w", type: "heading", props: { text: "own" }, advanced: { preset: "big" } }, { presets })
  assert.equal(w.props.tag, "h1")
  assert.equal(w.props.text, "own")
  assert.match(designSystemCss({ classes: [{ id: "card", name: "c", style: { base: { radius: "8px" } } }], presets }), /\.wbc-card\{border-radius:8px\}.*\.wbp-big\{font-size:40px\}/)
  assert.equal(variablesCss([{ id: "brand", name: "b", kind: "color", value: "#fff" }, { id: "bad", name: "x", kind: "other", value: "url(x)" }]), "--wb-v-brand:#fff")
  assert.equal(advancedClass({ classes: ["card", "Bad!"], preset: "big" }), "wbc-card wbp-big")
  assert.equal(scopedCss("color:red", ".x"), ".x{color:red}")
  assert.equal(scopedCss("selector:hover{color:red}</style><script>", ".x"), ".x:hover{color:red}/style>script>")
  assert.equal(scopedCss("selector{background:url(javascript:alert(1))}", ".x"), ".x{background:none}")
  assert.deepEqual(advancedAttrs({ attributes: [{ name: "data-x", value: "1" }, { name: "onclick", value: "a" }, { name: "aria-label", value: "javascript:1" }, { name: "tabindex", value: "0" }] }), { "data-x": "1", tabIndex: "0" })
})

test("position/effects style and grid placement", () => {
  const css = styleToCss({ position: "absolute", insetTop: "0", insetStart: "10px", zIndex: "5", gradient: "linear-gradient(90deg,#000,#fff)", backgroundImage: "/a.jpg", aspectRatio: "16/9", filter: "blur(2px)", transform: "url(x)" })
  assert.equal(css.position, "absolute")
  assert.equal(css.insetInlineStart, "10px")
  assert.equal(css.zIndex, 5)
  assert.equal(css.backgroundImage, 'linear-gradient(90deg,#000,#fff),url("/a.jpg")')
  assert.equal(css.transform, undefined)
  const doc = documentCss({ version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "text", props: {}, style: { base: { gridColumnSpan: "2" } }, advanced: { customCss: "selector{color:red}" } }] }] }] } as never)
  assert.match(doc, /\.wb-w\.wb-w\.wb-w\{grid-column:span 2\}/)
  assert.match(doc, /\.wb-w\{color:red\}/)
  assert.equal(styleToCss({ fluidFont: { min: "1rem", max: "2rem" } }).fontSize, "clamp(1rem, calc(1rem + 1.5vw), 2rem)")
})
