"use client"

import { useTranslations } from "next-intl"
import { useCallback, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => unknown
  title?: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  destructive?: boolean
  /** `action` switches the default title/button from delete wording to a generic confirmation. */
  intent?: "delete" | "action"
  pending?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  intent = "delete",
  pending = false,
}: ConfirmDialogProps) {
  const t = useTranslations("ui")
  const [busy, setBusy] = useState(false)
  const isBusy = busy || pending

  async function handleConfirm() {
    if (isBusy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      /* the caller surfaces the error (toast / inline); keep the dialog open for retry */
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !isBusy && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? (intent === "action" ? t("confirm_title") : t("confirm_delete_title"))}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? (intent === "action" ? null : t("confirm_delete_body"))}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>{cancelLabel ?? t("cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={isBusy}
            aria-busy={isBusy}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel ?? (destructive && intent === "delete" ? t("delete") : t("confirm"))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ConfirmRequest = Omit<ConfirmDialogProps, "open" | "onOpenChange" | "pending">

/**
 * Imperative confirm: `const { confirm, dialog } = useConfirm()`; render `{dialog}` once,
 * then `confirm({ onConfirm: () => remove(id) })` from any delete button.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [open, setOpen] = useState(false)

  const confirm = useCallback((req: ConfirmRequest) => {
    setRequest(req)
    setOpen(true)
  }, [])

  const dialog = request ? <ConfirmDialog {...request} open={open} onOpenChange={setOpen} /> : null

  return { confirm, dialog }
}
