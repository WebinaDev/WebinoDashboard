import assert from "node:assert/strict"
import { test } from "node:test"

import { aparatEmbed, fromLive, fromRow, mediaPath, playable, usesLiveMedia } from "./poetry-media.ts"

const live = (o: Record<string, unknown>) => ({ id: 1, title: "نوحه", kind: "audio", url: null, external_url: null, embed_url: null, cover: null, ...o })

test("live items without file or link are dropped", () => {
  assert.equal(fromLive(live({})), null)
  assert.equal(fromLive(live({ url: "javascript:alert(1)" })), null)
  const a = fromLive(live({ url: "/storage/a.mp3", poem: { slug: "s", title: "شب" }, occasion: { slug: "m", name: "محرم" } }))
  assert.equal(a?.src, "/storage/a.mp3"); assert.equal(a?.poem, "شب"); assert.equal(a?.tag, "محرم")
  const v = fromLive(live({ kind: "video", external_url: "https://www.aparat.com/v/abc" }))
  assert.equal(v?.embed, "https://www.aparat.com/video/video/embed/videohash/abc/vt/frame"); assert.equal(v?.src, "")
})

test("manual rows count only with a playable src", () => {
  assert.equal(fromRow({ title: "فقط عنوان", cover: "/c.jpg", src: "" }), null)
  assert.equal(fromRow({ title: "x", src: "//evil.com/a.mp3" }), null)
  assert.equal(fromRow({ title: "x", src: "/storage/v.mp4" })?.kind, "video")
  const e = fromRow({ title: "ایتا", src: "https://eitaa.com/ch/12" })
  assert.equal(e?.link, "https://eitaa.com/ch/12"); assert.equal(e?.src, "")
  assert.equal(playable([null, fromRow({ title: "a", src: "/a.mp3" })]).length, 1)
})

test("paths and source", () => {
  assert.equal(mediaPath(500), "media?limit=60")
  assert.equal(mediaPath(8, "video"), "media?limit=8&kind=video")
  assert.equal(aparatEmbed("https://eitaa.com/x"), "")
  assert.equal(usesLiveMedia(undefined), true); assert.equal(usesLiveMedia("manual"), false)
})
