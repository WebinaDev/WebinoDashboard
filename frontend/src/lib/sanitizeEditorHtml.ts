import createDOMPurify from "dompurify"

const EDITOR_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "u",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "img",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "sub",
  "sup",
  "mark",
]

const EDITOR_ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "target",
  "rel",
  "style",
  "class",
  "colspan",
  "rowspan",
  "width",
  "height",
]

let purify: ReturnType<typeof createDOMPurify> | null = null

function getPurify() {
  if (typeof window === "undefined") {
    return null
  }
  if (!purify) {
    purify = createDOMPurify(window)
  }
  return purify
}

export function sanitizeEditorHtml(html: string): string {
  const p = getPurify()
  if (!p) return html
  return p.sanitize(html, {
    ALLOWED_TAGS: EDITOR_ALLOWED_TAGS,
    ALLOWED_ATTR: EDITOR_ALLOWED_ATTR,
  })
}

export function editorPlainText(html: string): string {
  const stripped = sanitizeEditorHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
  return stripped
}

export function editorTextCounts(html: string): { chars: number; words: number } {
  const text = editorPlainText(html)
  if (!text) return { chars: 0, words: 0 }
  return {
    chars: text.length,
    words: text.split(/\s+/).filter(Boolean).length,
  }
}
