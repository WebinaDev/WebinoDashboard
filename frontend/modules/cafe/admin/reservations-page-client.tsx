"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"
import type { CafeBranch, CafeEvent } from "@/themes/cafe-starter/types"

import { CafeAdminShell, CafeAdvancedSection, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

/**
 * The full seating life. `no_show` matters most: it is the number that decides whether the
 * shop keeps taking online bookings, and it did not exist until the lifecycle did.
 */
type ReservationStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show"

type Reservation = {
  id: number
  guest_name: string
  guest_phone: string
  party_size: number
  reserved_at: string
  status: ReservationStatus
  notes?: string | null
  branch?: CafeBranch | null
  table_id?: number | null
  confirmed_at?: string | null
  seated_at?: string | null
  no_show_at?: string | null
  declined_at?: string | null
  decline_reason?: string | null
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

/** The booking a host takes while the guest is still on the telephone. */
const emptyBooking = {
  guest_name: "",
  guest_phone: "",
  party_size: 2,
  reserved_at: "",
  branch_id: "" as string | number,
  notes: "",
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

export default function ReservationsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.reservations")
  const tMenu = useTranslations("cafe_admin.menu")
  const tCommon = useTranslations("common")
  const { formatDateTime, formatNumber, locale } = useLocaleNext()
  const queryClient = useQueryClient()
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [bookingForm, setBookingForm] = useState(emptyBooking)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-reservations"],
    queryFn: () => api<ReservationsPayload>("/api/v1/cafe/reservations"),
  })

  const { data: branches = [] } = useQuery({
    queryKey: ["cafe-branches"],
    queryFn: () => api<CafeBranch[]>("/api/v1/cafe/branches"),
  })

  const updateReservation = useMutation({
    mutationFn: ({ id, status, tableId }: { id: number; status: ReservationStatus; tableId?: number | null }) =>
      api<Reservation>(`/api/v1/cafe/reservations/${id}`, {
        method: "PATCH",
        json: { status, ...(tableId === undefined ? {} : { table_id: tableId }) },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      toast.success(t("updated"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createReservation = useMutation({
    mutationFn: () =>
      api<Reservation>("/api/v1/cafe/reservations", {
        method: "POST",
        json: {
          guest_name: bookingForm.guest_name.trim(),
          guest_phone: bookingForm.guest_phone.trim(),
          party_size: Number(bookingForm.party_size),
          reserved_at: bookingForm.reserved_at,
          notes: bookingForm.notes.trim() || null,
          branch_id: bookingForm.branch_id ? Number(bookingForm.branch_id) : null,
        },
      }),
    onSuccess: async () => {
      setBookingForm(emptyBooking)
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      toast.success(t("booking_created"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
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
      toast.success(t("event_created"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const updateBooking = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "confirmed" | "cancelled" }) =>
      api<EventBooking>(`/api/v1/cafe/event-bookings/${id}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-reservations"] })
      toast.success(t("updated"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const reservations = data?.reservations ?? []
  const events = data?.events ?? []
  const pendingFirst = [...reservations].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1
    if (b.status === "pending" && a.status !== "pending") return 1
    return 0
  })

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <CafeSection title={t("reservations_heading")}>
        {pendingFirst.length === 0 ? (
          <CafeEmptyState message={t("empty_reservations")} />
        ) : (
          <div className="space-y-2">
            {pendingFirst.map((item) => (
              <div key={item.id} className="rounded-lg border px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{item.guest_name}</p>
                    <p className="text-muted-foreground" dir="ltr">
                      {item.guest_phone}
                    </p>
                    <p>
                      {t("party_size")}: {formatNumber(item.party_size)} · {formatDateTime(item.reserved_at)}
                    </p>
                    {item.branch ? (
                      <p className="text-muted-foreground text-xs">{item.branch.name_fa || item.branch.name_en}</p>
                    ) : null}
                    {item.notes ? <p className="text-muted-foreground mt-1">{item.notes}</p> : null}
                  </div>
                  <Badge variant={statusVariant(item.status)}>{t(`status_${item.status}`)}</Badge>
                </div>
                {item.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
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

                {/* Confirmed: the guest may arrive, or may not. Recording which is the whole
                    point of the lifecycle — a no-show never quietly rots in "confirmed". */}
                {item.status === "confirmed" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => updateReservation.mutate({ id: item.id, status: "seated" })}>
                      {t("seat")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateReservation.isPending}
                      onClick={() => updateReservation.mutate({ id: item.id, status: "no_show" })}
                    >
                      {t("no_show")}
                    </Button>
                  </div>
                ) : null}

                {/* Seated: closing the visit frees the table. */}
                {item.status === "seated" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateReservation.mutate({ id: item.id, status: "completed" })}
                    >
                      {t("complete")}
                    </Button>
                  </div>
                ) : null}

                {item.seated_at ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t("seated_at")}: {formatDateTime(item.seated_at)}
                  </p>
                ) : null}
                {item.no_show_at ? (
                  <p className="text-muted-foreground mt-2 text-xs">{t("marked_no_show")}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CafeSection>

      <CafeAdvancedSection
        title={t("new_booking")}
        description={t("new_booking_hint")}
        showLabel={tMenu("show_advanced")}
        hideLabel={tMenu("hide_advanced")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bk-name">{t("guest_name")}</Label>
            <Input
              id="bk-name"
              value={bookingForm.guest_name}
              onChange={(e) => setBookingForm((f) => ({ ...f, guest_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-phone">{t("guest_phone")}</Label>
            <Input
              id="bk-phone"
              dir="ltr"
              inputMode="tel"
              value={bookingForm.guest_phone}
              onChange={(e) => setBookingForm((f) => ({ ...f, guest_phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-party">{t("party_size")}</Label>
            <Input
              id="bk-party"
              type="number"
              min={1}
              max={50}
              value={bookingForm.party_size}
              onChange={(e) => setBookingForm((f) => ({ ...f, party_size: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("reserved_at")}</Label>
            <LocaleDatePicker
              locale={locale}
              withTime
              value={bookingForm.reserved_at}
              onChange={(value) => setBookingForm((f) => ({ ...f, reserved_at: value ?? "" }))}
              aria-label={t("reserved_at")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-branch">{t("branch")}</Label>
            <select
              id="bk-branch"
              className={cafeSelectClass}
              value={String(bookingForm.branch_id)}
              onChange={(e) => setBookingForm((f) => ({ ...f, branch_id: e.target.value }))}
            >
              <option value="">{t("any_branch")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name_fa || branch.name_en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bk-notes">{t("notes")}</Label>
            <Textarea
              id="bk-notes"
              rows={2}
              value={bookingForm.notes}
              onChange={(e) => setBookingForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            disabled={
              createReservation.isPending ||
              bookingForm.guest_name.trim() === "" ||
              bookingForm.guest_phone.trim() === "" ||
              bookingForm.reserved_at === ""
            }
            onClick={() => createReservation.mutate()}
          >
            {createReservation.isPending ? tCommon("saving") : t("save_booking")}
          </Button>
        </div>
      </CafeAdvancedSection>

      <CafeAdvancedSection
        title={t("create_event")}
        description={t("create_event_hint")}
        showLabel={tMenu("show_advanced")}
        hideLabel={tMenu("hide_advanced")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("event_title_fa")}</Label>
            <Input value={eventForm.title_fa} onChange={(e) => setEventForm((f) => ({ ...f, title_fa: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("event_title_en")}</Label>
            <Input value={eventForm.title_en} onChange={(e) => setEventForm((f) => ({ ...f, title_en: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("starts_at")}</Label>
            <LocaleDatePicker
              locale={locale}
              withTime
              value={eventForm.starts_at}
              onChange={(value) => setEventForm((f) => ({ ...f, starts_at: value ?? "" }))}
              aria-label={t("starts_at")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("ends_at")}</Label>
            <LocaleDatePicker
              locale={locale}
              withTime
              value={eventForm.ends_at}
              onChange={(value) => setEventForm((f) => ({ ...f, ends_at: value ?? "" }))}
              aria-label={t("ends_at")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("capacity")}</Label>
            <Input
              type="number"
              value={eventForm.capacity}
              onChange={(e) => setEventForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("price")}</Label>
            <Input
              type="number"
              value={eventForm.price_minor}
              onChange={(e) => setEventForm((f) => ({ ...f, price_minor: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("branch")}</Label>
            <select
              className={cafeSelectClass}
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
          <div className="space-y-1.5 sm:col-span-2">
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
          <div className="sm:col-span-2">
            <Button
              onClick={() => createEvent.mutate()}
              disabled={!eventForm.title_fa || !eventForm.title_en || !eventForm.starts_at || createEvent.isPending}
            >
              {t("create_event")}
            </Button>
          </div>
        </div>
      </CafeAdvancedSection>

      <CafeSection title={t("events_heading")}>
        {events.length === 0 ? (
          <CafeEmptyState message={t("empty_events")} />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{event.title_fa || event.title_en}</p>
                    <p className="text-muted-foreground">{formatDateTime(event.starts_at)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("capacity")}: {formatNumber(event.capacity)} · {t("price")}: {formatNumber(event.price_minor)}
                    </p>
                  </div>
                  {!event.is_active ? <Badge variant="secondary">{t("event_inactive")}</Badge> : null}
                </div>
                {(event.bookings ?? []).length > 0 ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">{t("bookings_heading")}</p>
                    {(event.bookings ?? []).map((booking) => (
                      <div key={booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2">
                        <div>
                          <p>{booking.guest_name}</p>
                          <p className="text-muted-foreground text-xs" dir="ltr">
                            {booking.guest_phone} · {t("seats")}: {formatNumber(booking.seats)}
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
            ))}
          </div>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
