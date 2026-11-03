"use client"

import { CalendarClock, Eye, FilePenLine, MessageSquareText, Send } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useEnumLabel, type EnumGroup } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"
import { cn } from "@/lib/utils"

export type ContentVisibility = "public" | "private" | "password"
export type CatalogVisibility = "visible" | "catalog" | "search" | "hidden"
export type PublishVisibilityMode = "content" | "catalog"

export type ContentPublishState = {
  status: string
  visibility: string
  password: string
  commentStatus: "open" | "closed"
  publishImmediately: boolean
  publishDate: string
}

const DEFAULT_STATUS_OPTIONS = ["draft", "pending", "published"] as const
const CATALOG_VISIBILITY_OPTIONS: CatalogVisibility[] = ["visible", "catalog", "search", "hidden"]
const PUBLISHED_STATUSES = new Set(["published", "publish"])

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

function ToolbarIconButton({
  label,
  value,
  onClick,
  active,
  children,
}: {
  label: string
  value: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? "secondary" : "outline"}
          className={cn("size-8 shrink-0", active && "border-primary/40")}
          onClick={onClick}
          aria-label={`${label}: ${value}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        <span className="font-medium">{label}:</span> {value}
      </TooltipContent>
    </Tooltip>
  )
}

function PublishDialogs({
  state,
  onChange,
  locale,
  showSchedule,
  statusOpen,
  setStatusOpen,
  visibilityOpen,
  setVisibilityOpen,
  dateOpen,
  setDateOpen,
  statusOptions,
  statusEnumGroup,
  visibilityMode,
}: {
  state: ContentPublishState
  onChange: (patch: Partial<ContentPublishState>) => void
  locale: string
  showSchedule: boolean
  statusOpen: boolean
  setStatusOpen: (v: boolean) => void
  visibilityOpen: boolean
  setVisibilityOpen: (v: boolean) => void
  dateOpen: boolean
  setDateOpen: (v: boolean) => void
  statusOptions: string[]
  statusEnumGroup: EnumGroup
  visibilityMode: PublishVisibilityMode
}) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()

  const [draftStatus, setDraftStatus] = useState(state.status)
  const [draftVisibility, setDraftVisibility] = useState(state.visibility)
  const [draftPassword, setDraftPassword] = useState(state.password)
  const [draftImmediate, setDraftImmediate] = useState(state.publishImmediately)
  const [draftDate, setDraftDate] = useState(state.publishDate)

  return (
    <>
      <Dialog
        open={statusOpen}
        onOpenChange={(open) => {
          if (open) setDraftStatus(state.status)
          setStatusOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("col_status")}</DialogTitle>
          </DialogHeader>
          <Select value={draftStatus} onValueChange={setDraftStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {enumLabel(statusEnumGroup, s)}
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

      <Dialog
        open={visibilityOpen}
        onOpenChange={(open) => {
          if (open) {
            setDraftVisibility(state.visibility)
            setDraftPassword(state.password)
          }
          setVisibilityOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {visibilityMode === "catalog" ? t("catalog_visibility_label") : t("visibility_label")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {visibilityMode === "catalog" ? (
              <Select value={draftVisibility} onValueChange={setDraftVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_VISIBILITY_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {enumLabel("catalog_visibility", v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Select
                  value={draftVisibility}
                  onValueChange={(v) => setDraftVisibility(v as ContentVisibility)}
                >
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
              </>
            )}
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

      {showSchedule ? (
        <Dialog
          open={dateOpen}
          onOpenChange={(open) => {
            if (open) {
              setDraftImmediate(state.publishImmediately)
              setDraftDate(state.publishDate)
            }
            setDateOpen(open)
          }}
        >
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
      ) : null}
    </>
  )
}

function usePublishLabels(
  state: ContentPublishState,
  locale: string,
  statusEnumGroup: EnumGroup,
  visibilityMode: PublishVisibilityMode,
) {
  const t = useTranslations("content_admin")
  const enumLabel = useEnumLabel()

  const visibilityLabel =
    visibilityMode === "catalog"
      ? enumLabel("catalog_visibility", state.visibility)
      : state.visibility === "private"
        ? t("visibility_private")
        : state.visibility === "password"
          ? t("visibility_password")
          : t("visibility_public")

  const publishLabel = state.publishImmediately
    ? t("publish_immediately")
    : formatDisplayDateTime(state.publishDate, locale)

  const commentsEnabled = state.commentStatus === "open"
  const commentsLabel = commentsEnabled ? t("comments_enabled") : t("comments_disabled")
  const statusLabel = enumLabel(statusEnumGroup, state.status)
  const isPublished = PUBLISHED_STATUSES.has(state.status)

  return { visibilityLabel, publishLabel, commentsEnabled, commentsLabel, statusLabel, isPublished }
}

export function ContentPublishPanel({
  state,
  onChange,
  onSave,
  isSaving,
  locale,
  showSchedule = true,
  showDiscussion = true,
  variant = "card",
  saveDisabled = false,
  statusOptions = [...DEFAULT_STATUS_OPTIONS],
  statusEnumGroup = "post_status",
  visibilityMode = "content",
}: {
  state: ContentPublishState
  onChange: (patch: Partial<ContentPublishState>) => void
  onSave: () => void
  isSaving: boolean
  locale: string
  showSchedule?: boolean
  showDiscussion?: boolean
  /** `toolbar` = icon controls beside Save (header actions). */
  variant?: "card" | "toolbar"
  saveDisabled?: boolean
  statusOptions?: string[]
  statusEnumGroup?: EnumGroup
  visibilityMode?: PublishVisibilityMode
}) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const [statusOpen, setStatusOpen] = useState(false)
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const { visibilityLabel, publishLabel, commentsEnabled, commentsLabel, statusLabel, isPublished } =
    usePublishLabels(state, locale, statusEnumGroup, visibilityMode)

  const dialogs = (
    <PublishDialogs
      state={state}
      onChange={onChange}
      locale={locale}
      showSchedule={showSchedule}
      statusOpen={statusOpen}
      setStatusOpen={setStatusOpen}
      visibilityOpen={visibilityOpen}
      setVisibilityOpen={setVisibilityOpen}
      dateOpen={dateOpen}
      setDateOpen={setDateOpen}
      statusOptions={statusOptions}
      statusEnumGroup={statusEnumGroup}
      visibilityMode={visibilityMode}
    />
  )

  if (variant === "toolbar") {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolbarIconButton
            label={t("panel_publish")}
            value={isPublished ? t("publish_button") : tCommon("save")}
            onClick={onSave}
            active={isPublished}
          >
            <Send className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton label={t("col_status")} value={statusLabel} onClick={() => setStatusOpen(true)}>
            <FilePenLine className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={visibilityMode === "catalog" ? t("catalog_visibility_label") : t("visibility_label")}
            value={visibilityLabel}
            onClick={() => setVisibilityOpen(true)}
          >
            <Eye className="size-4" />
          </ToolbarIconButton>
          {showDiscussion ? (
            <ToolbarIconButton
              label={t("discussion_label")}
              value={commentsLabel}
              active={commentsEnabled}
              onClick={() => onChange({ commentStatus: commentsEnabled ? "closed" : "open" })}
            >
              <MessageSquareText className="size-4" />
            </ToolbarIconButton>
          ) : null}
          {showSchedule ? (
            <ToolbarIconButton
              label={t("publish_date_label")}
              value={publishLabel}
              onClick={() => setDateOpen(true)}
            >
              <CalendarClock className="size-4" />
            </ToolbarIconButton>
          ) : null}
          <Button type="button" size="sm" disabled={saveDisabled || isSaving} onClick={onSave}>
            {isPublished ? t("publish_button") : tCommon("save")}
          </Button>
        </div>
        {dialogs}
      </TooltipProvider>
    )
  }

  return (
    <>
      <Card className="gap-4 py-4 shadow-sm">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm font-semibold">{t("panel_publish")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <MetaRow
            label={t("col_status")}
            value={statusLabel}
            editLabel={tCommon("edit")}
            onEdit={() => setStatusOpen(true)}
          />
          <MetaRow
            label={visibilityMode === "catalog" ? t("catalog_visibility_label") : t("visibility_label")}
            value={visibilityLabel}
            editLabel={tCommon("edit")}
            onEdit={() => setVisibilityOpen(true)}
          />
          {showDiscussion ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{t("discussion_label")}</p>
                <p className="text-muted-foreground text-xs">{commentsLabel}</p>
              </div>
              <Switch
                checked={commentsEnabled}
                onCheckedChange={(checked) => onChange({ commentStatus: checked ? "open" : "closed" })}
              />
            </div>
          ) : null}
          {showSchedule ? (
            <MetaRow
              label={t("publish_date_label")}
              value={publishLabel}
              editLabel={tCommon("edit")}
              onEdit={() => setDateOpen(true)}
            />
          ) : null}
        </CardContent>
        <CardFooter className="border-t px-4 pt-4">
          <Button type="button" className="w-full" disabled={saveDisabled || isSaving} onClick={onSave}>
            {isPublished ? t("publish_button") : tCommon("save")}
          </Button>
        </CardFooter>
      </Card>
      {dialogs}
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

/** Default publish state for new content (published + public + immediate). */
export function defaultPublishedState(): ContentPublishState {
  return {
    status: "published",
    visibility: "public",
    password: "",
    commentStatus: "open",
    publishImmediately: true,
    publishDate: defaultPublishDateLocal(),
  }
}

/** Default publish state for store products (publish + catalog visible). */
export function defaultProductPublishState(): ContentPublishState {
  return {
    status: "publish",
    visibility: "visible",
    password: "",
    commentStatus: "closed",
    publishImmediately: true,
    publishDate: defaultPublishDateLocal(),
  }
}
