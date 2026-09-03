"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import type { CafeEvent } from "@/themes/cafe-starter/types"

type BookingForm = {
  guest_name: string
  guest_phone: string
  seats: number
}

function localized(locale: string, fa?: string | null, en?: string | null) {
  return locale === "fa" ? fa ?? en ?? "" : en ?? fa ?? ""
}

export default function Page(_props: { route: ResolvedSiteRoute }) {
  const t = useTranslations("cafe_starter.reservations")
  const locale = useLocale()

  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "",
    party_size: 2,
    reserved_at: "",
    notes: "",
  })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bookingEventId, setBookingEventId] = useState<number | null>(null)
  const [bookingForm, setBookingForm] = useState<BookingForm>({ guest_name: "", guest_phone: "", seats: 1 })

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["public-cafe-events"],
    queryFn: () => api<CafeEvent[]>("/api/v1/public/cafe/events"),
  })

  const submitReservation = useMutation({
    mutationFn: () =>
      api("/api/v1/public/cafe/reservations", {
        method: "POST",
        json: {
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          party_size: Number(form.party_size),
          reserved_at: form.reserved_at,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      setMessage(t("success"))
      setForm({ guest_name: "", guest_phone: "", party_size: 2, reserved_at: "", notes: "" })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const bookEvent = useMutation({
    mutationFn: (eventId: number) =>
      api(`/api/v1/public/cafe/events/${eventId}/bookings`, {
        method: "POST",
        json: {
          guest_name: bookingForm.guest_name,
          guest_phone: bookingForm.guest_phone,
          seats: Number(bookingForm.seats),
        },
      }),
    onSuccess: () => {
      setMessage(t("booking_success"))
      setBookingEventId(null)
      setBookingForm({ guest_name: "", guest_phone: "", seats: 1 })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  function formatDate(value: string) {
    try {
      return new Date(value).toLocaleString(locale)
    } catch {
      return value
    }
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      {message ? <p className="text-center text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("form_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label>{t("guest_name")}</Label>
            <Input value={form.guest_name} onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))} />
          </div>
          <div>
            <Label>{t("guest_phone")}</Label>
            <Input value={form.guest_phone} onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))} />
          </div>
          <div>
            <Label>{t("party_size")}</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.party_size}
              onChange={(e) => setForm((f) => ({ ...f, party_size: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>{t("reserved_at")}</Label>
            <Input
              type="datetime-local"
              value={form.reserved_at}
              onChange={(e) => setForm((f) => ({ ...f, reserved_at: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <Button
            onClick={() => submitReservation.mutate()}
            disabled={
              !form.guest_name || !form.guest_phone || !form.reserved_at || submitReservation.isPending
            }
          >
            {t("submit")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("events_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
          {!isLoading && events.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_events")}</p>
          ) : null}
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{localized(locale, event.title_fa, event.title_en)}</p>
                  <p className="text-muted-foreground text-sm">{formatDate(event.starts_at)}</p>
                  {localized(locale, event.description_fa, event.description_en) ? (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {localized(locale, event.description_fa, event.description_en)}
                    </p>
                  ) : null}
                </div>
                {event.price_minor > 0 ? (
                  <Badge variant="outline">{event.price_minor}</Badge>
                ) : (
                  <Badge variant="secondary">{t("free")}</Badge>
                )}
              </div>
              {bookingEventId === event.id ? (
                <div className="mt-4 grid gap-2 border-t pt-4">
                  <div>
                    <Label>{t("guest_name")}</Label>
                    <Input
                      value={bookingForm.guest_name}
                      onChange={(e) => setBookingForm((f) => ({ ...f, guest_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("guest_phone")}</Label>
                    <Input
                      value={bookingForm.guest_phone}
                      onChange={(e) => setBookingForm((f) => ({ ...f, guest_phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("seats")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={bookingForm.seats}
                      onChange={(e) => setBookingForm((f) => ({ ...f, seats: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => bookEvent.mutate(event.id)}
                      disabled={
                        !bookingForm.guest_name || !bookingForm.guest_phone || bookEvent.isPending
                      }
                    >
                      {t("book_event")}
                    </Button>
                    <Button variant="outline" onClick={() => setBookingEventId(null)}>
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="mt-3" variant="outline" size="sm" onClick={() => setBookingEventId(event.id)}>
                  {t("book_event")}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button asChild variant="link">
          <Link href="/catalogue">{t("back_to_menu")}</Link>
        </Button>
      </div>
    </div>
  )
}
