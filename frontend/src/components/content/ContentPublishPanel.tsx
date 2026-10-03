"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"

export type ContentVisibility = "public" | "private" | "password"

export type ContentPublishState = {
  status: string
  visibility: ContentVisibility
  password: string
  commentStatus: "open" | "closed"
  publishImmediately: boolean
  publishDate: string
}

function MetaRow({
  label,
  value,
  onEdit,
  editLabel,
}: {
  label: string
  value: string
  onEdit?: () => void
  editLabel: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm">
      <span className="font-medium">{label}:</span>
      <span className="text-muted-foreground">{value}</span>
      {onEdit ? (
        <Button type="button" variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={onEdit}>
          {editLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function ContentPublishPanel({
  state,
  onChange,
  onSave,
  isSaving,
  locale,
  showSchedule = true,
}: {
  state: ContentPublishState
  onChange: (patch: Partial<ContentPublishState>) => void
  onSave: () => void
  isSaving: boolean
  locale: string
  showSchedule?: boolean
}) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const [statusOpen, setStatusOpen] = useState(false)
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  const [draftStatus, setDraftStatus] = useState(state.status)
  const [draftVisibility, setDraftVisibility] = useState(state.visibility)
  const [draftPassword, setDraftPassword] = useState(state.password)
  const [draftImmediate, setDraftImmediate] = useState(state.publishImmediately)
  const [draftDate, setDraftDate] = useState(state.publishDate)

  const visibilityLabel =
    state.visibility === "private"
      ? t("visibility_private")
      : state.visibility === "password"
        ? t("visibility_password")
        : t("visibility_public")

  const publishLabel = state.publishImmediately
    ? t("publish_immediately")
    : formatDisplayDateTime(state.publishDate, locale)

  const commentsEnabled = state.commentStatus === "open"

  return (
    <>
      <Card className="gap-4 py-4 shadow-sm">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm font-semibold">{t("panel_publish")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <MetaRow
            label={t("col_status")}
            value={enumLabel("post_status", state.status)}
            editLabel={tCommon("edit")}
            onEdit={() => {
              setDraftStatus(state.status)
              setStatusOpen(true)
            }}
          />
          <MetaRow
            label={t("visibility_label")}
            value={visibilityLabel}
            editLabel={tCommon("edit")}
            onEdit={() => {
              setDraftVisibility(state.visibility)
              setDraftPassword(state.password)
              setVisibilityOpen(true)
            }}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium">{t("discussion_label")}</p>
              <p className="text-muted-foreground text-xs">
                {commentsEnabled ? t("comments_enabled") : t("comments_disabled")}
              </p>
            </div>
            <Switch
              checked={commentsEnabled}
              onCheckedChange={(checked) => onChange({ commentStatus: checked ? "open" : "closed" })}
            />
          </div>
          {showSchedule ? (
            <MetaRow
              label={t("publish_date_label")}
              value={publishLabel}
              editLabel={tCommon("edit")}
              onEdit={() => {
                setDraftImmediate(state.publishImmediately)
                setDraftDate(state.publishDate)
                setDateOpen(true)
              }}
            />
          ) : null}
        </CardContent>
        <CardFooter className="border-t px-4 pt-4">
          <Button type="button" className="w-full" disabled={isSaving} onClick={onSave}>
            {state.status === "published" ? t("publish_button") : tCommon("save")}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("col_status")}</DialogTitle>
          </DialogHeader>
          <Select value={draftStatus} onValueChange={setDraftStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["draft", "pending", "published"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {enumLabel("post_status", s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange({ status: draftStatus })
                setStatusOpen(false)
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visibility_label")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={draftVisibility} onValueChange={(v) => setDraftVisibility(v as ContentVisibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t("visibility_public")}</SelectItem>
                <SelectItem value="private">{t("visibility_private")}</SelectItem>
                <SelectItem value="password">{t("visibility_password")}</SelectItem>
              </SelectContent>
            </Select>
            {draftVisibility === "password" ? (
              <div className="space-y-1">
                <Label>{t("password_label")}</Label>
                <Input
                  type="password"
                  value={draftPassword}
                  onChange={(e) => setDraftPassword(e.target.value)}
                  placeholder={t("password_placeholder")}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVisibilityOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange({ visibility: draftVisibility, password: draftPassword })
                setVisibilityOpen(false)
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("publish_date_label")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="publish-immediate">{t("publish_immediately")}</Label>
              <Switch
                id="publish-immediate"
                checked={draftImmediate}
                onCheckedChange={setDraftImmediate}
              />
            </div>
            {!draftImmediate ? (
              <div className="space-y-1">
                <Label htmlFor="publish-date">{t("publish_scheduled")}</Label>
                <LocaleDatePicker
                  id="publish-date"
                  locale={locale}
                  withTime
                  value={draftDate}
                  onChange={(value) => setDraftDate(value ?? "")}
                  aria-label={t("publish_scheduled")}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDateOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange({
                  publishImmediately: draftImmediate,
                  publishDate: draftDate,
                })
                setDateOpen(false)
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function publishStateToPayload(state: ContentPublishState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: state.status,
    visibility: state.visibility,
    comment_status: state.commentStatus,
  }
  if (state.visibility === "password" && state.password.trim()) {
    payload.password = state.password.trim()
  }
  if (!state.publishImmediately && state.publishDate) {
    payload.published_at = new Date(state.publishDate).toISOString()
  }
  return payload
}

export function defaultPublishDateLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
