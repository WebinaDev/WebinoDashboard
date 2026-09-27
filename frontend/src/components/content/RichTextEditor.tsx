"use client"

import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? "…" }),
    ],
    content: value || "",
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[200px] px-3 py-2 focus:outline-none",
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current && value !== editor.getText()) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <div className="bg-muted/40 flex flex-wrap gap-1 border-b p-1.5">
        {(
          [
            ["bold", () => editor.chain().focus().toggleBold().run()],
            ["italic", () => editor.chain().focus().toggleItalic().run()],
            ["underline", () => editor.chain().focus().toggleUnderline().run()],
            ["h2", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
            ["ul", () => editor.chain().focus().toggleBulletList().run()],
            ["ol", () => editor.chain().focus().toggleOrderedList().run()],
          ] as const
        ).map(([label, action]) => (
          <Button key={label} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={action}>
            {label}
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
