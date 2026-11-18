"use client"

import { Upload } from "lucide-react"
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

export type MediaDropzoneHandle = {
  openFilePicker: () => void
}

type MediaDropzoneProps = {
  multiple?: boolean
  disabled?: boolean
  busy?: boolean
  accept?: string
  onFiles: (files: File[]) => void
  emptyLabel?: string
  className?: string
  children?: ReactNode
}

export const MediaDropzone = forwardRef<MediaDropzoneHandle, MediaDropzoneProps>(function MediaDropzone(
  {
    multiple = true,
    disabled = false,
    busy = false,
    accept,
    onFiles,
    emptyLabel = "فایل را بکشید یا کلیک کنید",
    className,
    children,
  },
  ref,
) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const inactive = disabled || busy

  useImperativeHandle(ref, () => ({
    openFilePicker: () => {
      if (!inactive) fileRef.current?.click()
    },
  }))

  const emitFiles = useCallback(
    (files: File[]) => {
      if (inactive || files.length === 0) return
      onFiles(multiple ? files : files.slice(0, 1))
    },
    [inactive, multiple, onFiles],
  )

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inactive) return
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inactive) return
    e.dataTransfer.dropEffect = "copy"
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setIsDragging(false)
    if (inactive) return
    emitFiles(Array.from(e.dataTransfer.files))
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ""
    emitFiles(picked)
  }

  const showEmpty = !children

  return (
    <div
      role={showEmpty ? "button" : undefined}
      tabIndex={showEmpty && !inactive ? 0 : undefined}
      aria-disabled={inactive || undefined}
      onClick={() => {
        if (!inactive && !children) fileRef.current?.click()
      }}
      onKeyDown={(e) => {
        if (showEmpty && !inactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          fileRef.current?.click()
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative overflow-hidden rounded-xl border border-dashed transition-colors",
        showEmpty
          ? "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 bg-muted/30 p-6 text-center text-sm text-muted-foreground"
          : "border-transparent",
        isDragging && !inactive && "border-primary bg-primary/5 ring-2 ring-primary/30",
        !isDragging && showEmpty && "border-border",
        inactive && "pointer-events-none opacity-60",
        className,
      )}
    >
      {children ?? (
        <>
          <Upload className="size-6 shrink-0 opacity-70" aria-hidden />
          <span>{busy ? "در حال آپلود…" : emptyLabel}</span>
        </>
      )}
      {isDragging && !inactive ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 text-sm font-medium text-primary">
          رها کنید
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={inactive}
        onChange={handleInputChange}
      />
    </div>
  )
})
