import assert from "node:assert/strict"
import { test } from "node:test"

import { buildNavTree } from "./nav-tree"

test("multi-level nav rows become a tree", () => {
  const tree = buildNavTree([
    { label: "خانه", href: "/", level: "0" },
    { label: "فروشگاه", href: "/shop", level: "0" },
    { label: "پوشاک", href: "/c", level: "1" },
    { label: "کفش", href: "/s", level: "2" },
    { label: "تماس", href: "/contact", level: "0" },
  ])
  assert.deepEqual(tree.map((i) => i.label), ["خانه", "فروشگاه", "تماس"])
  assert.equal(tree[1].children[0].children[0].label, "کفش")
})
