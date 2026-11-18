"use client"

import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { OrderSidebarPanel } from "@/components/orders/OrderSidebarPanel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"

export type OrderNote = {
  id: number
  body: string
  is_customer?: boolean
  user?: { id: number; name?: string | null } | null
  created_at?: string
}

type OrderNotesPanelProps = {
  orderId: string | number
  notes: OrderNote[]
  onChanged: () => void | Promise<void>
  onError?: (message: string) => void
  onDeleteConfirm?: (run: () => Promise<unknown>) => void
}

/** Collapsible notes meta-box matching WP `OrderNotesPanel`. */
export function OrderNotesPanel({
  orderId,
  notes,
  onChanged,
  onError,
  onDeleteConfirm,
}: OrderNotesPanelProps) {
  const t = useTranslations("orders_admin")
  const locale = useLocale()
  const [body, setBody] = useState("")
  const [isCustomer, setIsCustomer] = useState(false)

  const addNote = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/${orderId}/notes`, {
        method: "POST",
        json: { body, is_customer: isCustomer },
      }),
    onSuccess: async () => {
      setBody("")
      setIsCustomer(false)
      await onChanged()
    },
    onError: (e: Error) => onError?.(getApiErrorMessage(e)),
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => api(`/api/v1/order-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => void onChanged(),
    onError: (e: Error) => onError?.(getApiErrorMessage(e)),
  })

  return (
    <OrderSidebarPanel title={t("notes")}>
      <ul className="mb-4 max-h-64 space-y-3 overflow-y-auto">
        {notes.length === 0 ? (
          <li className="text-muted-foreground text-sm">{t("empty_notes")}</li>
        ) : (
          notes.map((note) => (
            <li key={note.id} className="bg-muted/20 rounded-md border p-3 last:border-0">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm leading-relaxed break-words whitespace-pre-wrap">{note.body}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={deleteNote.isPending}
                  onClick={() => {
                    const run = () => deleteNote.mutateAsync(note.id)
                    if (onDeleteConfirm) onDeleteConfirm(run)
                    else void run()
                  }}
                  title={t("delete")}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatDisplayDateTime(note.created_at, locale, "")}
                {note.user?.name ? ` · ${note.user.name}` : ""}
                {note.is_customer ? ` · ${t("customer_note_flag")}` : ""}
              </p>
            </li>
          ))
        )}
      </ul>
      <div className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("note_ph")}
          rows={3}
          className="min-h-[80px]"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="customer-note"
            checked={isCustomer}
            onCheckedChange={(v) => setIsCustomer(v === true)}
          />
          <Label htmlFor="customer-note" className="text-sm font-normal">
            {t("customer_note_flag")}
          </Label>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!body.trim() || addNote.isPending}
          onClick={() => void addNote.mutateAsync()}
        >
          {t("add_note")}
        </Button>
      </div>
    </OrderSidebarPanel>
  )
}
