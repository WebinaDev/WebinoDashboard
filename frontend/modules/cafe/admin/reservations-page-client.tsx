"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"
import type { CafeBranch, CafeEvent } from "@/themes/cafe-starter/types"

type Reservation = {
  id: number
  guest_name: string
  guest_phone: string
  party_size: number
  reserved_at: string
  status: "pending" | "confirmed" | "cancelled"
  notes?: string | null
  branch?: CafeBranch | null
}

type EventBooking = {
  id: number
  guest_name: string
  guest_phone: string
  seats: number
  status: "pending" | "confirmed" | "cancelled"
}

type AdminEvent = CafeEvent & {
  is_active?: boolean
  branch?: CafeBranch | null
  bookings?: EventBooking[]
}

type ReservationsPayload = {
  reservations: Reservation[]
  events: AdminEvent[]
}

const emptyEvent = {
  title_fa: "",
  title_en: "",
  description_fa: "",
  description_en: "",
  starts_at: "",
  ends_at: "",
  capacity: 0,
  price_minor: 0,
  is_active: true,
  branch_id: "" as string | number,
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "confirmed") return "default"
  if (status === "cancelled") return "outline"
  return "secondary"
}

export default function ReservationsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.reservations")
  const tCommon = useTranslations("common")
  const { formatDateTime } = useLocaleNext()
  const queryClient = useQueryClient()

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState(emptyEvent)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-reservations"],
    queryFn: () => api<ReservationsPayload>("/api/v1/cafe/reservations"),
  })

  const { data: branches = [] } = useQuery({
    queryKey: ["cafe-branches"],
    queryFn: () => api<CafeBranch[]>("/api/v1/cafe/branches"),
  })

  const updateReservation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "confirmed" | "cancelled" }) =>
      api<Reservation>(`/api/v1/cafe/reservations/${id}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      setMessage(t("updated"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const createEvent = useMutation({
    mutationFn: () =>
      api<AdminEvent>("/api/v1/cafe/events", {
        method: "POST",
        json: {
          title_fa: eventForm.title_fa,
          title_en: eventForm.title_en,
          description_fa: eventForm.description_fa || null,
          description_en: eventForm.description_en || null,
          starts_at: eventForm.starts_at,
          ends_at: eventForm.ends_at || null,
          capacity: Number(eventForm.capacity),
          price_minor: Number(eventForm.price_minor),
          is_active: eventForm.is_active,
          branch_id: eventForm.branch_id ? Number(eventForm.branch_id) : null,
        },
      }),
    onSuccess: async () => {
      setEventForm(emptyEvent)
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      setMessage(t("event_created"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const updateBooking = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "confirmed" | "cancelled" }) =>
      api<EventBooking>(`/api/v1/cafe/event-bookings/${id}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      setMessage(t("updated"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const reservations = data?.reservations ?? []
  const events = data?.events ?? []

  function formatDate(value: string) {
    return formatDateTime(value)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {isLoading ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("reservations_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reservations.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_reservations")}</p>
          ) : (
            reservations.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.guest_name}</p>
                    <p className="text-muted-foreground">{item.guest_phone}</p>
                    <p className="mt-1">
                      {t("party_size")}: {item.party_size} · {formatDate(item.reserved_at)}
                    </p>
                    {item.branch ? (
                      <p className="text-muted-foreground text-xs">{item.branch.name_fa || item.branch.name_en}</p>
                    ) : null}
                    {item.notes ? <p className="text-muted-foreground mt-1">{item.notes}</p> : null}
                  </div>
                  <Badge variant={statusVariant(item.status)}>{t(`status_${item.status}`)}</Badge>
                </div>
                {item.status === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => updateReservation.mutate({ id: item.id, status: "confirmed" })}>
                      {t("confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateReservation.mutate({ id: item.id, status: "cancelled" })}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("create_event")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("event_title_fa")}</Label>
            <Input value={eventForm.title_fa} onChange={(e) => setEventForm((f) => ({ ...f, title_fa: e.target.value }))} />
          </div>
          <div>
            <Label>{t("event_title_en")}</Label>
            <Input value={eventForm.title_en} onChange={(e) => setEventForm((f) => ({ ...f, title_en: e.target.value }))} />
          </div>
          <div>
            <Label>{t("starts_at")}</Label>
            <Input
              type="datetime-local"
              value={eventForm.starts_at}
              onChange={(e) => setEventForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("ends_at")}</Label>
            <Input
              type="datetime-local"
              value={eventForm.ends_at}
              onChange={(e) => setEventForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("capacity")}</Label>
            <Input
              type="number"
              value={eventForm.capacity}
              onChange={(e) => setEventForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>{t("price")}</Label>
            <Input
              type="number"
              value={eventForm.price_minor}
              onChange={(e) => setEventForm((f) => ({ ...f, price_minor: Number(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("branch")}</Label>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={eventForm.branch_id}
              onChange={(e) => setEventForm((f) => ({ ...f, branch_id: e.target.value }))}
            >
              <option value="">{t("no_branch")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_fa || b.name_en}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("description_fa")}</Label>
            <Textarea
              value={eventForm.description_fa}
              onChange={(e) => setEventForm((f) => ({ ...f, description_fa: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={eventForm.is_active}
              onCheckedChange={(v) => setEventForm((f) => ({ ...f, is_active: Boolean(v) }))}
            />
            {t("event_active")}
          </label>
          <Button
            className="sm:col-span-2"
            onClick={() => createEvent.mutate()}
            disabled={!eventForm.title_fa || !eventForm.title_en || !eventForm.starts_at || createEvent.isPending}
          >
            {t("create_event")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("events_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_events")}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{event.title_fa || event.title_en}</p>
                    <p className="text-muted-foreground">{formatDate(event.starts_at)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("capacity")}: {event.capacity} · {t("price")}: {event.price_minor}
                    </p>
                  </div>
                  {!event.is_active ? <Badge variant="secondary">{t("event_inactive")}</Badge> : null}
                </div>
                {(event.bookings ?? []).length > 0 ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="font-medium">{t("bookings_heading")}</p>
                    {(event.bookings ?? []).map((booking) => (
                      <div key={booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                        <div>
                          <p>{booking.guest_name}</p>
                          <p className="text-muted-foreground text-xs">
                            {booking.guest_phone} · {t("seats")}: {booking.seats}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant(booking.status)}>{t(`status_${booking.status}`)}</Badge>
                          {booking.status === "pending" ? (
                            <>
                              <Button size="sm" onClick={() => updateBooking.mutate({ id: booking.id, status: "confirmed" })}>
                                {t("confirm")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateBooking.mutate({ id: booking.id, status: "cancelled" })}
                              >
                                {t("cancel")}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
