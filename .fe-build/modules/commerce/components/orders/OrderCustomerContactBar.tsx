"use client"

import { MessageCircle, Phone } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { EitaaIcon, WhatsAppIcon } from "@/components/orders/messenger-icons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type OrderCustomerContactBarProps = {
  phone?: string | null
  email?: string | null
  customerId?: number | null
  onSms?: () => void
  smsPending?: boolean
}

function whatsappDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0")) digits = `98${digits.slice(1)}`
  else if (!digits.startsWith("98")) digits = `98${digits}`
  return digits
}

function eitaaHref(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "98")
  return `https://eitaa.com/${digits}`
}

/** Contact icon row matching WP `OrderCustomerContactBar` placement. */
export function OrderCustomerContactBar({
  phone,
  email,
  customerId,
  onSms,
  smsPending,
}: OrderCustomerContactBarProps) {
  const t = useTranslations("orders_admin")
  const hasPhone = Boolean(phone?.trim())
  const digits = hasPhone ? phone!.replace(/\s/g, "") : ""

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-1.5">
        <IconLink tip={t("contact_call")} href={hasPhone ? `tel:${digits}` : undefined} disabled={!hasPhone}>
          <Phone className="size-4" />
        </IconLink>
        <IconBtn tip={t("contact_sms")} disabled={!hasPhone || smsPending} onClick={onSms}>
          <MessageCircle className="size-4" />
        </IconBtn>
        <IconLink
          tip={t("contact_whatsapp")}
          href={hasPhone ? `https://wa.me/${whatsappDigits(phone!)}` : undefined}
          disabled={!hasPhone}
          external
        >
          <WhatsAppIcon className="size-4" />
        </IconLink>
        <IconLink
          tip={t("contact_eitaa")}
          href={hasPhone ? eitaaHref(phone!) : undefined}
          disabled={!hasPhone}
          external
        >
          <EitaaIcon className="size-4" />
        </IconLink>
        {customerId && customerId > 0 ? (
          <Button asChild variant="outline" size="sm" className="ms-1">
            <Link href={`/dashboard/users/${customerId}`}>{t("open_customer")}</Link>
          </Button>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} className="text-muted-foreground ms-1 text-xs hover:underline" dir="ltr">
            {email}
          </a>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

function IconLink({
  tip,
  href,
  disabled,
  external,
  children,
}: {
  tip: string
  href?: string
  disabled?: boolean
  external?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled || !href ? (
          <Button type="button" variant="outline" size="icon" className="size-8" disabled>
            {children}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="icon" className="size-8" asChild>
            <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
              {children}
            </a>
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function IconBtn({
  tip,
  disabled,
  onClick,
  children,
}: {
  tip: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="size-8" disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
