"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResolvedAdminRoute } from "@/kernel/types";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-helpers";
import { toLocaleDigits } from "@/lib/locale";
import { MoneyText } from "@/components/currency/MoneyDisplay";

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui";

type FloorTable = {
  id: number;
  code: string;
  label?: string | null;
  seats: number;
  status: string;
  stored_status: string;
  /** The room this table stands in; empty means the shop never split its floor. */
  area?: string | null;
  occupied: boolean;
  open_orders: number;
  open_total_minor: number;
  /** What the till is still owed here — differs from open_total once part is paid. */
  unsettled_minor?: number;
  active_order_id?: number | null;
  seated_minutes?: number | null;
  /** Guests are done eating and the bill is the only thing left. */
  awaiting_settlement?: boolean;
  /** The same table, open long past the point somebody should have collected. */
  overdue?: boolean;
  overdue_after_minutes?: number;
  reservation_name?: string | null;
  reserved_for_at?: string | null;
  branch?: { id: number; name?: string | null } | null;
};

type Summary = {
  total: number;
  free: number;
  ordering: number;
  served: number;
  cleaning: number;
  reserved: number;
  awaiting_settlement?: number;
  overdue?: number;
  seated?: number;
  guests_seated: number;
  open_value_minor: number;
};

type FloorResponse = {
  data: FloorTable[];
  meta: { summary: Summary; polled_at: string };
};

const STATUS_ORDER = [
  "free",
  "ordering",
  "served",
  "awaiting_settlement",
  "overdue",
  "cleaning",
  "reserved",
] as const;

/** Colours chosen to read at a glance from across the room, not to be pretty. */
const STATUS_STYLE: Record<string, string> = {
  free: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
  ordering:
    "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
  served: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950",
  cleaning:
    "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950",
  reserved:
    "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900",
  // The till's queue: money owed and nothing being cooked. Amber, not the kitchen's blue —
  // a waiter scanning the room must not walk to this table expecting food.
  awaiting_settlement:
    "border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950",
  // A table nobody has collected from. It has to be the loudest thing on the board.
  overdue: "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950",
};

const STATUS_BADGE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  free: "secondary",
  ordering: "default",
  served: "outline",
  cleaning: "outline",
  reserved: "outline",
  awaiting_settlement: "secondary",
  overdue: "destructive",
};

export default function FloorPageClient({
  route,
}: {
  route: ResolvedAdminRoute;
}) {
  const t = useTranslations("cafe_admin.floor");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const currency = "IRT";
  const money = (v?: number | null) => (
    <MoneyText amount={v} currency={currency} fallback="-" />
  );

  const [reserveTarget, setReserveTarget] = useState<FloorTable | null>(null);
  const [reserveName, setReserveName] = useState("");
  const [reserveTime, setReserveTime] = useState("");

  const floor = useQuery({
    queryKey: ["cafe-floor"],
    queryFn: () => api<FloorResponse>("/api/v1/cafe/floor"),
    // A waiter board left open all shift must not go stale; light polling is enough here.
    refetchInterval: 15_000,
  });

  const setStatus = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Record<string, unknown>;
    }) => api(`/api/v1/cafe/floor/${id}`, { method: "PATCH", json: payload }),
    onSuccess: async () => {
      toast.success(t("status_updated"));
      setReserveTarget(null);
      setReserveName("");
      setReserveTime("");
      await queryClient.invalidateQueries({ queryKey: ["cafe-floor"] });
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  const freeTable = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/cafe/floor/${id}/free`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("status_updated"));
      await queryClient.invalidateQueries({ queryKey: ["cafe-floor"] });
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  const rows = floor.data?.data ?? [];
  const summary = floor.data?.meta?.summary;

  /**
   * Group the board by room.
   *
   * A twenty-table café is not one room, and a waiter works one hall at a time. The server
   * already returns the tables ordered by area, so this preserves that order rather than
   * sorting again by name — the room whose tables are oldest should stay where the shop put it.
   */
  const areas = rows.reduce<{ area: string | null; tables: FloorTable[] }[]>(
    (groups, table) => {
      const name = table.area?.trim() || null;
      const existing = groups.find((group) => group.area === name);
      if (existing) existing.tables.push(table);
      else groups.push({ area: name, tables: [table] });
      return groups;
    },
    [],
  );

  function changeStatus(table: FloorTable, status: string) {
    if (status === "reserved") {
      setReserveTarget(table);
      setReserveName(table.reservation_name ?? "");
      return;
    }
    if (status === "free") {
      freeTable.mutate(table.id);
      return;
    }
    setStatus.mutate({ id: table.id, payload: { status } });
  }

  function submitReservation() {
    if (!reserveTarget) return;
    if (!reserveName.trim()) {
      toast.error(t("reserve_name"));
      return;
    }
    setStatus.mutate({
      id: reserveTarget.id,
      payload: {
        status: "reserved",
        reservation_name: reserveName.trim(),
        reserved_for_at: reserveTime || undefined,
      },
    });
  }

  if (floor.isError) {
    return (
      <CafeAdminShell title={t("title")} description={t("description")}>
        <CafeEmptyState message={t("no_access")} />
      </CafeAdminShell>
    );
  }

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t("live_badge")}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void floor.refetch()}
            disabled={floor.isFetching}
          >
            {t("refresh")}
          </Button>
        </div>
      }
    >
      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
          <Tile
            label={t("summary_total")}
            value={toLocaleDigits(summary.total, locale)}
          />
          <Tile
            label={t("summary_free")}
            value={toLocaleDigits(summary.free ?? 0, locale)}
          />
          <Tile
            label={t("summary_ordering")}
            value={toLocaleDigits(summary.ordering ?? 0, locale)}
          />
          <Tile
            label={t("summary_served")}
            value={toLocaleDigits(summary.served ?? 0, locale)}
          />
          <Tile
            label={t("summary_cleaning")}
            value={toLocaleDigits(summary.cleaning ?? 0, locale)}
          />
          <Tile
            label={t("summary_reserved")}
            value={toLocaleDigits(summary.reserved ?? 0, locale)}
          />
          {/* The two states the waiter is actually hunting for when the room is busy. */}
          <Tile
            label={t("summary_awaiting_settlement")}
            value={toLocaleDigits(summary.awaiting_settlement ?? 0, locale)}
          />
          <Tile
            label={t("summary_overdue")}
            value={toLocaleDigits(summary.overdue ?? 0, locale)}
            tone={summary.overdue ? "danger" : undefined}
          />
          <Tile
            label={t("summary_guests")}
            value={toLocaleDigits(summary.guests_seated ?? 0, locale)}
          />
        </div>
      ) : null}

      <CafeSection title={t("title")} description={t("description")}>
        {floor.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-muted h-40 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <CafeEmptyState message={t("floor_empty")} />
        ) : (
          <div className="space-y-5">
            {areas.map((group) => (
              <div key={group.area ?? "__none"} className="space-y-2">
                {areas.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {group.area ?? t("area_none")}
                    </h3>
                    <span className="text-muted-foreground text-xs">
                      {toLocaleDigits(String(group.tables.length), locale)}
                    </span>
                    <span className="bg-border h-px flex-1" aria-hidden />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {group.tables.map((table) => (
                    <div
                      key={table.id}
                      className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${STATUS_STYLE[table.status] ?? "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold leading-tight">
                            {table.code}
                          </p>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {table.label || "-"}
                          </p>
                        </div>
                        <Badge
                          variant={STATUS_BADGE[table.status] ?? "outline"}
                          className="shrink-0 text-[10px]"
                        >
                          {t(
                            `set_${table.status === "ordering" ? "ordering" : table.status}`,
                          )}
                        </Badge>
                      </div>

                      <div className="space-y-0.5 text-xs">
                        <p>
                          {t("open_orders")}:{" "}
                          <span className="font-semibold">
                            {toLocaleDigits(table.open_orders, locale)}
                          </span>
                        </p>
                        <p>
                          {t("open_total")}:{" "}
                          <span className="font-semibold">
                            {money(table.open_total_minor)}
                          </span>
                        </p>
                        {/* Only shown when it differs; otherwise it is the same number twice and
                            the waiter stops reading it. */}
                        {table.unsettled_minor !== undefined &&
                        table.unsettled_minor !== table.open_total_minor ? (
                          <p className="text-red-600 dark:text-red-400">
                            {t("unsettled")}:{" "}
                            <span className="font-semibold">
                              {money(table.unsettled_minor)}
                            </span>
                          </p>
                        ) : null}
                        <p>
                          {t("seated_for")}:{" "}
                          <span className="font-semibold">
                            {table.seated_minutes === null ||
                            table.seated_minutes === undefined
                              ? "-"
                              : `${toLocaleDigits(table.seated_minutes, locale)} ${t("minutes")}`}
                          </span>
                        </p>
                        {table.reservation_name ? (
                          <p className="truncate">
                            {t("reserved_for")}:{" "}
                            <span className="font-semibold">
                              {table.reservation_name}
                            </span>
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-auto flex flex-wrap gap-1">
                        {table.status !== "served" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-2.5 text-xs"
                            onClick={() => changeStatus(table, "served")}
                          >
                            {t("set_served")}
                          </Button>
                        ) : null}
                        {table.status !== "cleaning" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-2.5 text-xs"
                            onClick={() => changeStatus(table, "cleaning")}
                          >
                            {t("set_cleaning")}
                          </Button>
                        ) : null}
                        {table.status !== "reserved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-2.5 text-xs"
                            onClick={() => changeStatus(table, "reserved")}
                          >
                            {t("set_reserved")}
                          </Button>
                        ) : null}
                        {table.status !== "free" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 px-2.5 text-xs"
                            onClick={() => changeStatus(table, "free")}
                          >
                            {t("set_free")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CafeSection>

      {reserveTarget ? (
        <CafeSection
          title={t("reserve_title")}
          description={reserveTarget.label || reserveTarget.code}
        >
          <div className="grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reserve-name">{t("reserve_name")}</Label>
              <Input
                id="reserve-name"
                value={reserveName}
                onChange={(e) => setReserveName(e.target.value)}
                placeholder={t("reserve_name_ph")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reserve-time">{t("reserve_time")}</Label>
              <Input
                id="reserve-time"
                type="datetime-local"
                value={reserveTime}
                onChange={(e) => setReserveTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submitReservation} disabled={setStatus.isPending}>
              {t("reserve_confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setReserveTarget(null)}>
              {t("cancel")}
            </Button>
          </div>
        </CafeSection>
      ) : null}
    </CafeAdminShell>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-xl border p-2.5 ${tone === "danger" ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : ""}`}
    >
      <p className="text-muted-foreground truncate text-[11px]">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums ${tone === "danger" ? "text-red-600 dark:text-red-400" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
