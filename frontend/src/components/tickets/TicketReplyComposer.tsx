"use client"

import { Mic, Paperclip, Square } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export type TicketAttachmentView = {
  name: string
  mime?: string
  kind?: string
  url?: string | null
  size?: number
}

type Props = {
  body: string
  onBodyChange: (value: string) => void
  onSubmit: (payload: { body: string; files: File[]; voice: File | null }) => void | Promise<void>
  pending?: boolean
  disabled?: boolean
}

export function TicketReplyAttachments({ attachments }: { attachments?: TicketAttachmentView[] }) {
  if (!attachments?.length) return null
  return (
    <ul className="mt-3 grid gap-2">
      {attachments.map((file, index) => {
        const key = `${file.name}-${index}`
        if (file.kind === "voice" || (file.mime ?? "").startsWith("audio/")) {
          return (
            <li key={key} className="rounded-lg border bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium">{file.name}</p>
              {file.url ? <audio controls preload="none" className="w-full max-w-md" src={file.url} /> : null}
            </li>
          )
        }
        if ((file.mime ?? "").startsWith("image/") && file.url) {
          return (
            <li key={key}>
              <a href={file.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border">
                <img src={file.url} alt={file.name} className="max-h-48 w-auto object-contain" loading="lazy" />
              </a>
            </li>
          )
        }
        return (
          <li key={key}>
            <a
              href={file.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted/40"
            >
              <Paperclip className="size-3.5" />
              {file.name}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function TicketReplyComposer({ body, onBodyChange, onSubmit, pending, disabled }: Props) {
  const t = useTranslations("tickets")
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [voice, setVoice] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    return () => {
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stop()
      }
    }
  }, [])

  async function toggleRecord() {
    if (recording && mediaRef.current) {
      mediaRef.current.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
      setVoice(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" }))
    }
    mediaRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  const canSend = Boolean(body.trim() || files.length || voice) && !pending && !disabled

  return (
    <div className="space-y-3">
      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={t("reply_placeholder")}
        rows={4}
        disabled={disabled || pending}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,audio/*"
          onChange={(e) => {
            const next = Array.from(e.target.files ?? []).slice(0, 5)
            setFiles(next)
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => fileRef.current?.click()}>
          <Paperclip className="me-1 size-3.5" />
          {t("attach_file")}
        </Button>
        <Button type="button" size="sm" variant={recording ? "destructive" : "outline"} disabled={disabled || pending} onClick={() => void toggleRecord()}>
          {recording ? <Square className="me-1 size-3.5" /> : <Mic className="me-1 size-3.5" />}
          {recording ? t("stop_voice") : t("record_voice")}
        </Button>
        <Button
          type="button"
          disabled={!canSend}
          onClick={() => void onSubmit({ body, files, voice })}
        >
          {t("send_reply")}
        </Button>
      </div>
      {files.length || voice ? (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {files.map((file) => (
            <li key={file.name + file.size}>{t("attached_file", { name: file.name })}</li>
          ))}
          {voice ? <li>{t("attached_voice")}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

export function buildTicketReplyFormData(payload: { body: string; files: File[]; voice: File | null }) {
  const fd = new FormData()
  if (payload.body.trim()) fd.append("body", payload.body.trim())
  payload.files.forEach((file, index) => fd.append(`attachments[${index}]`, file))
  if (payload.voice) fd.append("voice", payload.voice)
  return fd
}
