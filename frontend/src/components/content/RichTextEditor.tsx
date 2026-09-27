"use client"

import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import UnderlineExt from '@tiptap/extension-underline'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eraser,
  Heading2,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Underline,
  Undo2,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { MediaPickerDialog } from '@/components/content/MediaPickerDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { htmlDir } from '@/lib/locale'
import { formatNumber, normalizeUiLocale } from '@/lib/locale'
import { isSafeContentUrl } from '@/lib/safeUrl'
import { editorTextCounts, sanitizeEditorHtml } from '@/lib/sanitizeEditorHtml'
import { cn } from '@/lib/utils'

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
}

const TEXT_COLORS = ['#111827', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#6d28d9', '#be185d']
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fde68a']

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  disabled,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  title: string
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="size-8"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function ToolbarSep() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
}

function ColorSwatches({
  colors,
  onPick,
}: {
  colors: string[]
  onPick: (color: string) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5 p-1">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="size-6 rounded-md border border-border shadow-sm"
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  )
}

function VisualToolbar({
  editor,
  disabled,
  fullscreen,
  onToggleFullscreen,
  onOpenMedia,
  onImageUrl,
}: {
  editor: Editor
  disabled?: boolean
  fullscreen: boolean
  onToggleFullscreen: () => void
  onOpenMedia: () => void
  onImageUrl: () => void
}) {
  const t = useTranslations('editor')
  const heading =
    editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('heading', { level: 4 })
          ? 'h4'
          : 'p'

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        title={t('undo')}
      >
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        title={t('redo')}
      >
        <Redo2 className="size-4" />
      </ToolbarButton>
      <ToolbarSep />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" disabled={disabled}>
            <Heading2 className="size-4" />
            {heading === 'p' ? t('paragraph') : heading.toUpperCase()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            {t('paragraph')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            {t('heading2')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            {t('heading3')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
            {t('heading4')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarSep />
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t('bold')}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t('italic')}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title={t('underline')}
      >
        <Underline className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title={t('strike')}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('superscript')}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        title={t('superscript')}
      >
        <SuperscriptIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('subscript')}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        title={t('subscript')}
      >
        <SubscriptIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title={t('inlineCode')}
      >
        <Code className="size-4" />
      </ToolbarButton>
      <ToolbarSep />
      <ToolbarButton
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title={t('alignRight')}
      >
        <AlignRight className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title={t('alignCenter')}
      >
        <AlignCenter className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title={t('alignLeft')}
      >
        <AlignLeft className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        title={t('justify')}
      >
        <AlignJustify className="size-4" />
      </ToolbarButton>
      <ToolbarSep />
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t('bulletList')}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t('orderedList')}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title={t('quote')}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title={t('codeBlock')}
      >
        <Code className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t('hr')}
      >
        <Minus className="size-4" />
      </ToolbarButton>
      <ToolbarSep />
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={() => {
          const prev = editor.getAttributes('link').href as string | undefined
          const url = window.prompt(t('linkPrompt'), prev ?? '')
          if (url === null) return
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          if (!isSafeContentUrl(url)) return
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }}
        title={t('link')}
      >
        <Link2 className="size-4" />
      </ToolbarButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" title={t('image')} disabled={disabled}>
            <ImageIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onOpenMedia}>{t('imageMedia')}</DropdownMenuItem>
          <DropdownMenuItem onClick={onImageUrl}>{t('imageUrl')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" title={t('table')} disabled={disabled}>
            <TableIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            {t('tableInsert')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
            {t('tableAddCol')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
            {t('tableAddRow')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
            {t('tableDelCol')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
            {t('tableDelRow')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()}>
            {t('tableDelete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" title={t('textColor')} disabled={disabled}>
            <Palette className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto p-2">
          <ColorSwatches
            colors={TEXT_COLORS}
            onPick={(color) => editor.chain().focus().setColor(color).run()}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-xs"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            {t('clearColor')}
          </Button>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" title={t('highlight')} disabled={disabled}>
            <Highlighter className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto p-2">
          <ColorSwatches
            colors={HIGHLIGHT_COLORS}
            onPick={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-xs"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            {t('clearHighlight')}
          </Button>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        title={t('clearFormat')}
      >
        <Eraser className="size-4" />
      </ToolbarButton>
      <ToolbarSep />
      <ToolbarButton
        active={fullscreen}
        onClick={onToggleFullscreen}
        title={fullscreen ? t('exitFullscreen') : t('fullscreen')}
      >
        {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </ToolbarButton>
    </div>
  )
}

function CountBar({ chars, words }: { chars: number; words: number }) {
  const t = useTranslations("editor")
  const locale = normalizeUiLocale(useLocale())
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-xl border border-t-0 border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{t("wordCount", { count: formatNumber(words, locale) })}</span>
      <span>{t("charCount", { count: formatNumber(chars, locale) })}</span>
    </div>
  )
}

export function RichTextEditor({ value, onChange, disabled, placeholder }: RichTextEditorProps) {
  const t = useTranslations('editor')
  const dir = htmlDir(useLocale())
  const [tab, setTab] = useState<'visual' | 'code'>('visual')
  const [codeValue, setCodeValue] = useState(value)
  const [fullscreen, setFullscreen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      UnderlineExt,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({
        table: { resizable: false },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      CharacterCount.configure({ limit: null }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (ed.isDestroyed) return
      const html = ed.getHTML()
      onChange(html)
      setCodeValue(html)
    },
  })

  const editorReady = Boolean(editor && !editor.isDestroyed)

  useEffect(() => {
    if (!editorReady || !editor) return
    // Avoid emitUpdate: true (default) — it fires onUpdate with empty HTML before setContent syncs.
    editor.setEditable(!disabled, false)
  }, [disabled, editor, editorReady])

  useEffect(() => {
    if (!editorReady || !editor) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value, { emitUpdate: false })
      setCodeValue(value)
    }
  }, [value, editor, editorReady])

  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  function switchTab(next: string) {
    if (next === 'code' && editorReady && editor) {
      setCodeValue(editor.getHTML())
    }
    if (next === 'visual' && editorReady && editor) {
      const safe = sanitizeEditorHtml(codeValue)
      editor.commands.setContent(safe, { emitUpdate: false })
      onChange(safe)
      setCodeValue(safe)
    }
    setTab(next as 'visual' | 'code')
  }

  function applyCodeChange(html: string) {
    const safe = sanitizeEditorHtml(html)
    setCodeValue(safe)
    onChange(safe)
    if (editorReady && editor) {
      editor.commands.setContent(safe, { emitUpdate: false })
    }
  }

  function addImageUrl() {
    if (!editorReady || !editor) return
    const url = window.prompt(t('imageUrlPrompt'))
    if (!url || !isSafeContentUrl(url)) return
    editor.chain().focus().setImage({ src: url }).run()
  }

  const visualCounts =
    editorReady && editor
      ? {
          chars: editor.storage.characterCount.characters(),
          words: editor.storage.characterCount.words(),
        }
      : editorTextCounts(codeValue)
  const htmlCounts = editorTextCounts(codeValue)
  const counts = tab === 'visual' ? visualCounts : htmlCounts

  return (
    <div
      dir={dir}
      className={cn(
        fullscreen && 'bg-background fixed inset-0 z-50 flex flex-col p-3',
      )}
    >
      <Tabs
        value={tab}
        onValueChange={switchTab}
        className={cn('gap-0', fullscreen && 'flex min-h-0 flex-1 flex-col')}
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border bg-muted/40 px-2 py-1.5">
          <TabsList className="h-8 bg-transparent p-0">
            <TabsTrigger value="visual" className="h-7 px-3 text-xs">
              {t('visual')}
            </TabsTrigger>
            <TabsTrigger value="code" className="h-7 px-3 text-xs">
              {t('code')}
            </TabsTrigger>
          </TabsList>
          {tab === 'visual' && editorReady && editor ? (
            <VisualToolbar
              editor={editor}
              disabled={disabled}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((v) => !v)}
              onOpenMedia={() => setMediaOpen(true)}
              onImageUrl={addImageUrl}
            />
          ) : null}
        </div>
        <TabsContent
          value="visual"
          className={cn('mt-0', fullscreen && 'flex min-h-0 flex-1 flex-col')}
        >
          <EditorContent
            editor={editor}
            dir={dir}
            className={cn(
              'border-border bg-background px-4 py-3 text-sm text-start border-x border-b-0',
              fullscreen ? 'min-h-0 flex-1 overflow-y-auto' : 'min-h-72',
              '[&_.tiptap]:outline-none [&_.tiptap]:text-start',
              fullscreen ? '[&_.tiptap]:min-h-full' : '[&_.tiptap]:min-h-64',
              '[&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child]:before:float-start [&_.tiptap_p.is-editor-empty:first-child]:before:h-0 [&_.tiptap_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
              '[&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-semibold',
              '[&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold',
              '[&_.tiptap_h4]:mb-1.5 [&_.tiptap_h4]:text-sm [&_.tiptap_h4]:font-semibold',
              '[&_.tiptap_ul]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:ps-6',
              '[&_.tiptap_ol]:my-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:ps-6',
              '[&_.tiptap_blockquote]:my-2 [&_.tiptap_blockquote]:border-s-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:ps-4 [&_.tiptap_blockquote]:text-muted-foreground',
              '[&_.tiptap_pre]:my-2 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:bg-muted [&_.tiptap_pre]:p-3',
              '[&_.tiptap_img]:my-2 [&_.tiptap_img]:max-h-80 [&_.tiptap_img]:rounded-md',
              '[&_.tiptap_hr]:my-4 [&_.tiptap_hr]:border-border',
              '[&_.tiptap_table]:my-3 [&_.tiptap_table]:w-full [&_.tiptap_table]:border-collapse [&_.tiptap_table]:text-sm',
              '[&_.tiptap_th]:border [&_.tiptap_th]:border-border [&_.tiptap_th]:bg-muted/50 [&_.tiptap_th]:px-2 [&_.tiptap_th]:py-1.5 [&_.tiptap_th]:text-start [&_.tiptap_th]:font-semibold',
              '[&_.tiptap_td]:border [&_.tiptap_td]:border-border [&_.tiptap_td]:px-2 [&_.tiptap_td]:py-1.5',
              '[&_.tiptap_.has-text-align-left]:text-left',
              '[&_.tiptap_.has-text-align-center]:text-center',
              '[&_.tiptap_.has-text-align-right]:text-right',
              '[&_.tiptap_.has-text-align-justify]:text-justify',
              '[&_.tiptap_u]:underline',
              '[&_.tiptap_mark]:rounded-sm [&_.tiptap_mark]:px-0.5',
              disabled && 'pointer-events-none opacity-60',
            )}
          />
        </TabsContent>
        <TabsContent
          value="code"
          className={cn('mt-0', fullscreen && 'flex min-h-0 flex-1 flex-col')}
        >
          <Textarea
            value={codeValue}
            onChange={(e) => applyCodeChange(e.target.value)}
            disabled={disabled}
            dir="ltr"
            className={cn(
              'rounded-none border-x border-b-0 border-border font-mono text-xs leading-relaxed',
              fullscreen ? 'min-h-0 flex-1' : 'min-h-72',
            )}
            spellCheck={false}
          />
        </TabsContent>
        <CountBar chars={counts.chars} words={counts.words} />
      </Tabs>
      <MediaPickerDialog
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        onPick={(item) => {
          if (!editorReady || !editor || !item.url || !isSafeContentUrl(item.url)) return
          editor.chain().focus().setImage({ src: item.url }).run()
        }}
      />
    </div>
  )
}
