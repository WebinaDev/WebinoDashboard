"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Hammer, RefreshCw, Square } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  applyCoreUpdate,
  fetchCoreUpdateStatus,
  type CoreUpdateStatus,
} from "@/lib/core-update-api"
import {
  cancelBuildPipeline,
  fetchBuildPipelineStatus,
  startBuildPipeline,
} from "@/lib/build-pipeline-api"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type HostCaps = {
  self_update_enabled?: boolean
  build_pipeline_enabled?: boolean
  version?: string
  ui_locale?: string
  ui_theme?: string
  ui_fullscreen_default?: boolean
}

export function DashboardSiteSettingsPanel() {
  const tUpdate = useTranslations("settings_hub.dashboard.coreUpdate")
  const tPipeline = useTranslations("settings_hub.dashboard.buildPipeline")
  const qc = useQueryClient()

  const hostQ = useDraftSettings<HostCaps>("site", "dashboard")
  const { draft: hostDraft, setDraft: setHostDraft, persist: persistHost, pending: hostPending, saved: hostSaved, error: hostError } = hostQ
  const selfUpdateEnabled = hostQ.draft?.self_update_enabled === true
  const pipelineEnabled = hostQ.draft?.build_pipeline_enabled === true

  const statusQ = useQuery({
    queryKey: ["core-update-status"],
    queryFn: () => fetchCoreUpdateStatus(false),
    staleTime: 60_000,
  })

  const refresh = useMutation({
    mutationFn: () => fetchCoreUpdateStatus(true),
    onSuccess: (data) => {
      qc.setQueryData(["core-update-status"], data)
      toast.success(tUpdate("refreshed"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const update = useMutation({
    mutationFn: () => applyCoreUpdate(statusQ.data?.latest_version),
    onSuccess: (r) => {
      toast.success(tUpdate("success", { version: r.version }))
      if (r.reload_required) {
        window.setTimeout(() => window.location.reload(), 800)
      }
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const pipelineQ = useQuery({
    queryKey: ["build-pipeline-status"],
    queryFn: fetchBuildPipelineStatus,
    enabled: pipelineEnabled,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  })

  const start = useMutation({
    mutationFn: startBuildPipeline,
    onSuccess: () => {
      toast.success(tPipeline("started"))
      void qc.invalidateQueries({ queryKey: ["build-pipeline-status"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const cancel = useMutation({
    mutationFn: cancelBuildPipeline,
    onSuccess: () => {
      toast.message(tPipeline("cancelled"))
      void qc.invalidateQueries({ queryKey: ["build-pipeline-status"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const s: CoreUpdateStatus | undefined = statusQ.data
  const updateBusy = refresh.isPending || update.isPending || statusQ.isFetching
  const pipeline = pipelineQ.data
  const running = pipeline?.status === "running"
  const pipelineBusy = start.isPending || cancel.isPending || pipelineQ.isFetching

  const prevStatus = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (pipeline?.status === "success" && prevStatus.current === "running") {
      toast.success(tPipeline("success"))
    }
    prevStatus.current = pipeline?.status
  }, [pipeline?.status, tPipeline])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tUpdate("prefsTitle")}</CardTitle>
          <CardDescription>{tUpdate("prefsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <div className="grid gap-1">
            <Label>{tUpdate("uiLocale")}</Label>
            <Select
              value={hostDraft?.ui_locale ?? "fa"}
              onValueChange={(v) => setHostDraft({ ...(hostDraft ?? {}), ui_locale: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fa">fa</SelectItem>
                <SelectItem value="en">en</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>{tUpdate("uiTheme")}</Label>
            <Select
              value={hostDraft?.ui_theme ?? "system"}
              onValueChange={(v) => setHostDraft({ ...(hostDraft ?? {}), ui_theme: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">system</SelectItem>
                <SelectItem value="light">light</SelectItem>
                <SelectItem value="dark">dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>{tUpdate("uiFullscreen")}</Label>
            <Switch
              checked={Boolean(hostDraft?.ui_fullscreen_default)}
              onCheckedChange={(v) => setHostDraft({ ...(hostDraft ?? {}), ui_fullscreen_default: v })}
            />
          </div>
          <SettingsSaveBar
            onSave={() => void persistHost()}
            pending={hostPending}
            saved={hostSaved}
            error={hostError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tUpdate("title")}</CardTitle>
          <CardDescription>{tUpdate("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{tUpdate("current")}:</span>
            <Badge variant="secondary">{s?.version ?? hostQ.draft?.version ?? "—"}</Badge>
            <span className="text-muted-foreground">{tUpdate("latest")}:</span>
            <Badge variant="outline">{s?.latest_version ?? "—"}</Badge>
            {s?.update_available ? (
              <Badge>{tUpdate("available")}</Badge>
            ) : (
              <Badge variant="secondary">{tUpdate("upToDate")}</Badge>
            )}
          </div>
          {s?.unavailable ? (
            <p className="text-muted-foreground text-sm">{tUpdate("serviceUnavailable")}</p>
          ) : null}
          {s?.update_available && !s?.package_available ? (
            <p className="text-amber-600 text-sm dark:text-amber-400">{tUpdate("packageMissing")}</p>
          ) : null}
          {s?.release_notes ? (
            <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {s.release_notes}
            </pre>
          ) : null}
          {!selfUpdateEnabled ? (
            <p className="text-muted-foreground text-sm">{tUpdate("selfUpdateDisabled")}</p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={updateBusy}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="me-2 size-4" aria-hidden />
            {tUpdate("checkAgain")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              updateBusy ||
              !selfUpdateEnabled ||
              !s?.update_available ||
              !s?.package_available
            }
            onClick={() => {
              if (!window.confirm(tUpdate("confirm"))) return
              update.mutate()
            }}
          >
            <Download className="me-2 size-4" aria-hidden />
            {tUpdate("install")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tPipeline("title")}</CardTitle>
          <CardDescription>{tPipeline("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pipelineEnabled ? (
            <p className="text-muted-foreground text-sm">{tPipeline("disabledOnHost")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {pipeline?.status === "running" ? (
                  <Badge>{tPipeline("statusRunning")}</Badge>
                ) : pipeline?.status === "success" ? (
                  <Badge variant="secondary">{tPipeline("statusSuccess")}</Badge>
                ) : pipeline?.status === "failed" ? (
                  <Badge variant="destructive">{tPipeline("statusFailed")}</Badge>
                ) : (
                  <Badge variant="outline">{tPipeline("statusIdle")}</Badge>
                )}
              </div>
              {pipeline?.steps?.length ? (
                <ul className="space-y-1 text-sm">
                  {pipeline.steps.map((step) => (
                    <li key={step.id} className="flex items-center gap-2">
                      <span
                        className={
                          step.done
                            ? "text-emerald-600"
                            : running && pipeline.current_step === step.id
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                        }
                      >
                        {step.done ? "✓" : running && pipeline.current_step === step.id ? "…" : "○"}
                      </span>
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {pipeline?.error ? (
                <p className="text-destructive text-sm">{pipeline.error}</p>
              ) : null}
              {pipeline?.log_tail ? (
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                  {pipeline.log_tail}
                </pre>
              ) : null}
            </>
          )}
        </CardContent>
        {pipelineEnabled ? (
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pipelineBusy || running}
              onClick={() => {
                if (!window.confirm(tPipeline("confirm"))) return
                start.mutate()
              }}
            >
              <Hammer className="me-2 size-4" aria-hidden />
              {tPipeline("run")}
            </Button>
            {running ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pipelineBusy}
                onClick={() => cancel.mutate()}
              >
                <Square className="me-2 size-4" aria-hidden />
                {tPipeline("cancel")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pipelineBusy}
                onClick={() => void qc.invalidateQueries({ queryKey: ["build-pipeline-status"] })}
              >
                <RefreshCw className="me-2 size-4" aria-hidden />
                {tPipeline("refresh")}
              </Button>
            )}
          </CardFooter>
        ) : null}
      </Card>
    </div>
  )
}
