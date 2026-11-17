"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"

import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"

import { useSendOtp, useVerifyOtp } from "../lib/guest"
import { CafeSheet } from "./CafeSheet"

/** Persian/Arabic digits → ASCII so the OTP endpoint always receives one shape. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

/**
 * Phone verification for guest ordering: send a 5-digit code, then confirm it.
 *
 * The code field autofocuses, digits are shown in the page language and a resend timer
 * prevents accidental double sends. Success never leaves the sheet half-open.
 */
export function OtpSheet({
  open,
  onOpenChange,
  phone,
  onVerified,
  skin,
  scheme,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  onVerified?: (phone: string) => void
  skin?: string
  scheme?: string
  locale: string
}) {
  const t = useTranslations("cafe_starter.otp")
  const tMenu = useTranslations("cafe_starter")
  const send = useSendOtp()
  const verify = useVerifyOtp()
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [value, setValue] = useState(phone)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStep("phone")
      setValue(phone)
      setCode("")
      setError(null)
      setSeconds(0)
    }
  }, [open, phone])

  useEffect(() => {
    if (seconds <= 0) return
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [seconds])

  function requestCode() {
    const clean = toAsciiDigits(value).replace(/[\s-]/g, "")
    setError(null)
    send.mutate(clean, {
      onSuccess: () => {
        setStep("code")
        setSeconds(60)
        window.setTimeout(() => codeRef.current?.focus(), 120)
      },
      onError: (e) => setError(getApiErrorMessage(e as Error)),
    })
  }

  function confirm() {
    setError(null)
    verify.mutate(
      { phone: toAsciiDigits(value).replace(/[\s-]/g, ""), code: toAsciiDigits(code) },
      {
        onSuccess: () => {
          onVerified?.(toAsciiDigits(value).replace(/[\s-]/g, ""))
          onOpenChange(false)
        },
        onError: (e) => setError(getApiErrorMessage(e as Error)),
      },
    )
  }

  return (
    <CafeSheet
      open={open}
      onOpenChange={onOpenChange}
      title={step === "phone" ? t("title") : t("code_title")}
      description={step === "phone" ? t("hint") : t("code_hint")}
      closeLabel={tMenu("close")}
      placement="center"
      skin={skin}
      scheme={scheme}
      className="cafe-otp-sheet"
    >
      <form
        className="cafe-otp-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (step === "phone") requestCode()
          else confirm()
        }}
      >
        <span className="cafe-otp-badge" aria-hidden="true">
          <ShieldCheck className="size-5" />
        </span>

        {step === "phone" ? (
          <>
            <label className="cafe-otp-label" htmlFor="cafe-otp-phone">
              {t("phone")}
            </label>
            <input
              id="cafe-otp-phone"
              className="cafe-field cafe-otp-phone"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("phone_placeholder")}
            />
          </>
        ) : (
          <>
            <p className="cafe-hint cafe-otp-sent">
              {t("sent_to", { phone: toLocaleDigits(value, locale) })}
            </p>
            <label className="cafe-otp-label" htmlFor="cafe-otp-code">
              {t("code")}
            </label>
            <input
              id="cafe-otp-code"
              ref={codeRef}
              className="cafe-field cafe-otp-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="•••••"
            />
            <button
              type="button"
              className="cafe-otp-resend"
              disabled={seconds > 0 || send.isPending}
              onClick={requestCode}
            >
              {seconds > 0
                ? t("resend_in", { seconds: toLocaleDigits(String(seconds), locale) })
                : t("resend")}
            </button>
          </>
        )}

        {error ? <p className="cafe-error">{error}</p> : null}

        <button
          type="submit"
          className="cafe-primary-btn"
          disabled={send.isPending || verify.isPending || (step === "code" && code.length < 4)}
        >
          {step === "phone"
            ? send.isPending
              ? t("sending")
              : t("send")
            : verify.isPending
              ? t("checking")
              : t("verify")}
        </button>
      </form>
    </CafeSheet>
  )
}
