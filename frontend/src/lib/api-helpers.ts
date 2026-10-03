import { ApiError } from "@/lib/api"
import enMessages from "../../messages/en.json"
import faMessages from "../../messages/fa.json"

const STATUS_KEYS: Record<number, string> = {
  401: "status_401",
  403: "status_403",
  404: "status_404",
  409: "status_409",
  422: "status_422",
  429: "status_429",
  500: "status_500",
  502: "status_502",
  503: "status_503",
}

const KEY_TO_MESSAGE: Record<string, string> = {
  "2FA_REQUIRED": "two_factor",
  ACCOUNT_DISABLED: "account_disabled",
  FORBIDDEN: "forbidden",
  UNAUTHORIZED: "unauthorized",
  AJAX_REQUIRED: "ajax_required",
  MODULE_NOT_ACTIVE: "module_not_active",
  MODULE_NOT_LICENSED: "module_not_licensed",
  "auth.unauthorized": "unauthorized",
  "auth.forbidden": "forbidden",
  "errors.not_found": "status_404",
  "errors.server": "status_500",
  "validation.failed": "status_422",
  "Two-factor authentication required": "two_factor",
}

function uiLocale(): "fa" | "en" {
  if (typeof document === "undefined") return "fa"
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  return match?.[1] === "en" ? "en" : "fa"
}

function apiErrorText(key: string): string {
  const pack = (uiLocale() === "en" ? enMessages : faMessages).api_errors
  return pack[key as keyof typeof pack] ?? key
}

type ErrorBody = {
  message?: unknown
  errors?: Record<string, unknown> & { code?: unknown }
}

function firstValidationError(errors: Record<string, unknown> | undefined): string | undefined {
  if (!errors || typeof errors !== "object") return undefined
  for (const [key, value] of Object.entries(errors)) {
    if (key === "code") continue
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
      return value[0]
    }
    if (typeof value === "string" && value.trim() && value !== "MODULE_NOT_ACTIVE") {
      return value
    }
  }
  return undefined
}

/**
 * Persian-friendly message for fetch/`ApiError` failures (ERP `getAxiosMessage` parity).
 */
export function getApiErrorMessage(err: unknown, body?: ErrorBody | null): string {
  const status =
    err instanceof ApiError
      ? err.status
      : err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : undefined

  const messageFromBody =
    typeof body?.message === "string" && body.message.trim() ? body.message.trim() : undefined
  const code =
    typeof body?.errors?.code === "string" && body.errors.code !== ""
      ? body.errors.code
      : undefined

  const coded = code ? KEY_TO_MESSAGE[code] : undefined
  if (coded) return apiErrorText(coded)

  const validation = firstValidationError(body?.errors)
  if (validation && validation !== "Server Error") {
    return validation
  }

  const mappedBody = messageFromBody ? KEY_TO_MESSAGE[messageFromBody] : undefined
  if (mappedBody) return apiErrorText(mappedBody)
  if (messageFromBody === "Server Error") {
    return apiErrorText("status_500")
  }
  if (messageFromBody && !/^[a-z0-9_.]+$/i.test(messageFromBody)) {
    return messageFromBody
  }

  if (typeof status === "number" && STATUS_KEYS[status]) {
    return apiErrorText(STATUS_KEYS[status])
  }

  if (err instanceof Error) {
    if (err.message === "Network Error" || err.message === "Failed to fetch") {
      return apiErrorText("network")
    }
    if (/^HTTP \d+/.test(err.message)) {
      const n = Number(err.message.replace(/^HTTP /, ""))
      return STATUS_KEYS[n] ? apiErrorText(STATUS_KEYS[n]) : apiErrorText("request_failed")
    }
    if (err.message && !/^Request failed/i.test(err.message)) {
      const mapped = KEY_TO_MESSAGE[err.message]
      return mapped ? apiErrorText(mapped) : err.message
    }
  }

  return apiErrorText("unknown")
}
