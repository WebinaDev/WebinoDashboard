import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { publishAfterGlobals } from "./publish-flow"

describe("publish dependencies", () => {
  it("publishes globals before the document", async () => {
    const order: string[] = []
    const result = await publishAfterGlobals(async () => { order.push("globals"); return true }, async () => { order.push("document") })
    assert.equal(result, true)
    assert.deepEqual(order, ["globals", "document"])
  })
  it("does not publish the document when globals fail", async () => {
    let called = false
    assert.equal(await publishAfterGlobals(async () => false, async () => { called = true }), false)
    assert.equal(called, false)
  })
  it("propagates a document publication error", async () => {
    await assert.rejects(publishAfterGlobals(async () => true, async () => { throw new Error("failed") }), /failed/)
  })
})
