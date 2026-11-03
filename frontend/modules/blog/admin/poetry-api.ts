/** Shared API helpers for poetry admin pages (poems / media / terms). */

import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import type { PoetryTerm } from "./poetry-types"

export type { PoetryTerm, PoemListRow as PoetryPoemRow } from "./poetry-types"
export type PoetryTermKind = PoetryTerm["kind"]

type Envelope = { data: { data: any } }

const unwrap = (v: unknown) =>
  v && typeof v === "object" && "meta" in v && "data" in v ? (v as { data: unknown }).data : v

const call = async (
  method: string,
  path: string,
  json?: unknown,
  params?: Record<string, unknown>,
): Promise<Envelope> => {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ""
  const out = await api<unknown>(`/api${path}${qs ? `?${qs}` : ""}`, {
    method,
    ...(json !== undefined ? { json } : {}),
  })
  return { data: { data: unwrap(out) } }
}

export const poetryApi = {
  get: (p: string, o?: { params?: Record<string, unknown> }) => call("GET", p, undefined, o?.params),
  post: (p: string, b?: unknown) => call("POST", p, b ?? {}),
  put: (p: string, b?: unknown) => call("PUT", p, b ?? {}),
  delete: (p: string) => call("DELETE", p),
}

export const poetryError = (e: unknown) => getApiErrorMessage(e)

export type PoetryMediaRow = {
  id: number
  title: string
  kind: "audio" | "video"
  url: string | null
  external_url: string | null
  cover: string | null
  media_id: number | null
  file_url: string | null
  occasion_id: number | null
  poem_id: number | null
  poem?: { title: string } | null
  occasion?: PoetryTerm | null
  reciter?: string | null
  duration?: string | null
  sort: number
  status: "draft" | "published"
}

export type PoetryMediaForm = {
  id?: number
  title: string
  kind: "audio" | "video"
  media_id: number | null
  file_url: string
  external_url: string
  cover: string
  occasion_id: number | null
  poem_id: number | null
  reciter: string
  duration: string
  sort: number
  status: "draft" | "published"
}

export const emptyPoetryMedia = (kind: "audio" | "video"): PoetryMediaForm => ({
  title: "",
  kind,
  media_id: null,
  file_url: "",
  external_url: "",
  cover: "",
  occasion_id: null,
  poem_id: null,
  reciter: "",
  duration: "",
  sort: 0,
  status: "published",
})
