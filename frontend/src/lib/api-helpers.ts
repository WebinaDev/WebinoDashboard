import { ApiError } from "@/lib/api"

const STATUS_MESSAGES: Record<number, string> = {
  401: "نشست شما منقضی شده است. دوباره وارد شوید.",
  403: "دسترسی به این بخش مجاز نیست.",
  404: "منبع درخواستی پیدا نشد.",
  409: "این عملیات با وضعیت فعلی در تضاد است.",
  422: "اطلاعات ارسال‌شده معتبر نیست.",
  429: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
  500: "خطای داخلی سرور. صفحه را تازه کنید یا کمی بعد دوباره تلاش کنید.",
  502: "سرور در دسترس نیست. کمی بعد دوباره تلاش کنید.",
  503: "سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.",
}

const KEY_MESSAGES: Record<string, string> = {
  "2FA_REQUIRED": "احراز هویت دو مرحله‌ای لازم است. کد ارسال‌شده را وارد کنید.",
  ACCOUNT_DISABLED: "این حساب غیرفعال است.",
  FORBIDDEN: "دسترسی به این بخش مجاز نیست.",
  UNAUTHORIZED: "نشست شما منقضی شده است. دوباره وارد شوید.",
  AJAX_REQUIRED: "درخواست نامعتبر است. صفحه را تازه کنید.",
  MODULE_NOT_ACTIVE: "این ماژول فعال نیست.",
  MODULE_NOT_LICENSED: "این ماژول لایسنس ندارد.",
  "auth.unauthorized": "نشست شما منقضی شده است. دوباره وارد شوید.",
  "auth.forbidden": "دسترسی به این بخش مجاز نیست.",
  "errors.not_found": "منبع درخواستی پیدا نشد.",
  "errors.server": "خطای داخلی سرور. صفحه را تازه کنید یا کمی بعد دوباره تلاش کنید.",
  "validation.failed": "اطلاعات ارسال‌شده معتبر نیست.",
  "Two-factor authentication required":
    "احراز هویت دو مرحله‌ای لازم است. کد ارسال‌شده را وارد کنید.",
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

  if (code && KEY_MESSAGES[code]) {
    return KEY_MESSAGES[code]
  }

  const validation = firstValidationError(body?.errors)
  if (validation && validation !== "Server Error") {
    return validation
  }

  if (messageFromBody && KEY_MESSAGES[messageFromBody]) {
    return KEY_MESSAGES[messageFromBody]
  }
  if (messageFromBody === "Server Error") {
    return STATUS_MESSAGES[500]
  }
  if (messageFromBody && !/^[a-z0-9_.]+$/i.test(messageFromBody)) {
    return messageFromBody
  }

  if (typeof status === "number" && STATUS_MESSAGES[status]) {
    return STATUS_MESSAGES[status]
  }

  if (err instanceof Error) {
    if (err.message === "Network Error" || err.message === "Failed to fetch") {
      return "اتصال به سرور برقرار نشد. آدرس API را بررسی کنید."
    }
    if (/^HTTP \d+/.test(err.message)) {
      const n = Number(err.message.replace(/^HTTP /, ""))
      return STATUS_MESSAGES[n] ?? "درخواست ناموفق بود."
    }
    if (err.message && !/^Request failed/i.test(err.message)) {
      return KEY_MESSAGES[err.message] ?? err.message
    }
  }

  return "خطای ناشناخته"
}
