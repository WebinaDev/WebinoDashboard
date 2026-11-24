"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { MoneyText } from "@/components/currency/MoneyDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResolvedAdminRoute } from "@/kernel/types";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-helpers";
import { toLocaleDigits } from "@/lib/locale";

import {
  CafeAdminShell,
  CafeEmptyState,
  CafeSection,
  cafeSelectClass,
} from "./cafe-admin-ui";

/**
 * انبار — one ledger, one truth.
 *
 * The screen exists because stock used to live in two tables that disagreed and neither posted
 * a journal. Every write here goes through the ledger endpoint, which records the movement and
 * posts its value, so what this page shows and what the balance sheet shows cannot drift apart.
 */

type CostRow = {
  subject_type: string;
  subject_id: number;
  name: string;
  unit: string | null;
  base_unit?: string | null;
  purchase_unit?: string | null;
  pack_size?: number | null;
  qty_on_hand: number;
  avg_cost_minor: number;
  last_cost_minor: number;
  reorder_point: number | null;
  low: boolean;
};

type ExpiringBatch = {
  batch_id: number;
  batch_no: string | null;
  product_name: string | null;
  quantity: number;
  unit: string | null;
  expires_on: string;
  days_left: number;
  slot: string | null;
  expired: boolean;
};

type Suggestion = {
  product_id: number;
  name: string;
  on_hand: number;
  reorder_point: number;
  shortfall: number;
  suggested_quantity: number;
  purchase_unit: string | null;
  packs: number;
  estimated_cost_minor: number;
};

type Warehouse = { id: number; name: string };

type WasteReport = {
  from: string;
  to: string;
  total_value_minor: number;
  by_kind: {
    kind: string;
    quantity: number;
    value_minor: number;
    lines: number;
    share_percent: number | null;
  }[];
  by_item: {
    product_id: number;
    name: string;
    quantity: number;
    value_minor: number;
  }[];
};

const WASTE_KINDS = ["waste", "spoilage", "staff_meal", "other"] as const;

const blankMove = {
  product_id: "",
  quantity: "",
  unit_cost_minor: "",
  reason: "",
  kind: "waste" as (typeof WASTE_KINDS)[number],
  // A lot is optional, because a shop that does not track lots must not be forced to invent
  // one — but a shop that does can only enter it here. Without these two fields the ledger's
  // batch and expiry support was reachable only by hand-written requests.
  batch_no: "",
  expires_on: "",
};

export default function StockPageClient({
  route: _route,
}: {
  route: ResolvedAdminRoute;
}) {
  const t = useTranslations("cafe_admin.stock");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [moveForm, setMoveForm] = useState(blankMove);
  const [mode, setMode] = useState<"waste" | "receive" | "count">("waste");
  const [transfer, setTransfer] = useState({
    product_id: "",
    from: "",
    to: "",
    quantity: "",
  });

  const costing = useQuery({
    queryKey: ["cafe-stock-costing"],
    queryFn: async () => {
      // `/stock/costing` returns the rows directly inside `data`; `needs_reorder` is the
      // backend's name for the low flag, mapped here so the table has one shape.
      const res = await api<{
        data: (Omit<CostRow, "low"> & { needs_reorder: boolean })[];
      }>("/api/v1/stock/costing");
      return (res?.data ?? []).map((row) => ({
        ...row,
        low: row.needs_reorder,
      }));
    },
    retry: false,
  });

  const warehouses = useQuery({
    queryKey: ["cafe-warehouses"],
    queryFn: async () => {
      const res = await api<{ data: { warehouses: Warehouse[] } }>(
        "/api/v1/accounting/warehouses",
      );
      return res?.data?.warehouses ?? [];
    },
    retry: false,
  });

  /**
   * Waste by cause, not just by total.
   *
   * The saving button on this page has asked for a kind (waste, spoilage, staff meal, other)
   * since it was written; until the ledger stored it, all four arrived as one number and the
   * question "should I fix the fridge or the shelf?" had no answer on this screen.
   */
  const wasteReport = useQuery({
    queryKey: ["cafe-stock-waste-report"],
    queryFn: async () => {
      const res = await api<{ data: WasteReport }>(
        "/api/v1/stock/waste-report",
      );
      return res?.data ?? null;
    },
    retry: false,
  });

  const expiring = useQuery({
    queryKey: ["cafe-stock-expiring"],
    queryFn: async () => {
      const res = await api<{ data: { batches: ExpiringBatch[] } }>(
        "/api/v1/stock/expiring?days=7",
      );
      return res?.data?.batches ?? [];
    },
    retry: false,
  });

  const reorder = useQuery({
    queryKey: ["cafe-stock-reorder"],
    queryFn: async () => {
      const res = await api<{ data: { suggestions: Suggestion[] } }>(
        "/api/v1/stock/reorder",
      );
      return res?.data?.suggestions ?? [];
    },
    retry: false,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cafe-stock-costing"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-stock-expiring"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-stock-reorder"] }),
    ]);
  };

  const submitMove = useMutation({
    mutationFn: async () => {
      if (mode === "waste") {
        return api("/api/v1/stock/waste", {
          method: "POST",
          json: {
            product_id: Number(moveForm.product_id),
            quantity: Number(moveForm.quantity),
            reason: moveForm.reason.trim(),
            kind: moveForm.kind,
            batch_no: moveForm.batch_no.trim() || null,
          },
        });
      }

      if (mode === "count") {
        return api("/api/v1/stock/count", {
          method: "POST",
          json: {
            product_id: Number(moveForm.product_id),
            counted_quantity: Number(moveForm.quantity),
          },
        });
      }

      return api("/api/v1/stock/receive", {
        method: "POST",
        json: {
          product_id: Number(moveForm.product_id),
          quantity: Number(moveForm.quantity),
          unit_cost_minor: Number(moveForm.unit_cost_minor),
          note: moveForm.reason.trim() || null,
          batch_no: moveForm.batch_no.trim() || null,
          expires_on: moveForm.expires_on.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      setMoveForm(blankMove);
      await invalidate();
      toast.success(t("saved"));
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  const submitTransfer = useMutation({
    mutationFn: () =>
      api("/api/v1/stock/transfer", {
        method: "POST",
        json: {
          product_id: Number(transfer.product_id),
          from_warehouse_id: Number(transfer.from),
          to_warehouse_id: Number(transfer.to),
          quantity: Number(transfer.quantity),
        },
      }),
    onSuccess: async () => {
      setTransfer({ product_id: "", from: "", to: "", quantity: "" });
      await invalidate();
      toast.success(t("transferred"));
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  /* ------------------------------------------------------- opening stock --- */

  // A shop that has traded for a year opens with full shelves. It has that inventory in a
  // spreadsheet, not in its head; the preview writes nothing and reports each line it cannot
  // accept, and the commit receives the rest through the same ledger a purchase uses.
  const [opening, setOpening] = useState("");
  const [openingResult, setOpeningResult] = useState<{
    ready?: number;
    total?: number;
    errors?: { line: number; message: string }[];
    received?: number;
    failed?: { line: number; message: string }[];
  } | null>(null);

  const previewOpening = useMutation({
    mutationFn: () =>
      api<{
        ready: number;
        total: number;
        errors: { line: number; message: string }[];
      }>("/api/v1/stock/opening/preview", {
        method: "POST",
        json: { body: opening },
      }),
    onSuccess: (res) => setOpeningResult(res),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  const commitOpening = useMutation({
    mutationFn: () =>
      api<{ received: number; failed: { line: number; message: string }[] }>(
        "/api/v1/stock/opening/commit",
        { method: "POST", json: { body: opening } },
      ),
    onSuccess: async (res) => {
      setOpeningResult(res);
      await invalidate();
      toast.success(t("opening_done", { count: res.received }));
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  });

  const items = costing.data ?? [];
  const canSubmitMove =
    moveForm.product_id !== "" &&
    Number(moveForm.quantity) > 0 &&
    (mode !== "waste" || moveForm.reason.trim() !== "") &&
    (mode !== "receive" || moveForm.unit_cost_minor !== "");

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection title={t("movement_title")} description={t("movement_hint")}>
        <div className="flex flex-wrap gap-2">
          {(["waste", "receive", "count"] as const).map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={mode === kind ? "default" : "outline"}
              onClick={() => setMode(kind)}
            >
              {t(`mode_${kind}`)}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-product">{t("item")}</Label>
            <select
              id="st-product"
              className={cafeSelectClass}
              value={moveForm.product_id}
              onChange={(e) =>
                setMoveForm((f) => ({ ...f, product_id: e.target.value }))
              }
            >
              <option value="">{t("choose_item")}</option>
              {items.map((row) => (
                <option
                  key={`${row.subject_type}-${row.subject_id}`}
                  value={String(row.subject_id)}
                >
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="st-qty">
              {mode === "count" ? t("counted") : t("quantity")}
            </Label>
            <Input
              id="st-qty"
              type="number"
              min={0}
              step="0.001"
              value={moveForm.quantity}
              onChange={(e) =>
                setMoveForm((f) => ({ ...f, quantity: e.target.value }))
              }
            />
          </div>

          {mode === "receive" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="st-cost">{t("unit_cost")}</Label>
                <Input
                  id="st-cost"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={moveForm.unit_cost_minor}
                  onChange={(e) =>
                    setMoveForm((f) => ({
                      ...f,
                      unit_cost_minor: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-batch-in">{t("batch")}</Label>
                <Input
                  id="st-batch-in"
                  dir="ltr"
                  value={moveForm.batch_no}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, batch_no: e.target.value }))
                  }
                  placeholder={t("batch_optional")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-expires">{t("expires_on")}</Label>
                {/* Gregorian in the field, because a date input is a date input; the expiring
                  table renders it Jalali like the rest of the app. */}
                <Input
                  id="st-expires"
                  type="date"
                  dir="ltr"
                  value={moveForm.expires_on}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, expires_on: e.target.value }))
                  }
                />
              </div>
            </>
          ) : null}

          {mode === "waste" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="st-kind">{t("kind")}</Label>
                <select
                  id="st-kind"
                  className={cafeSelectClass}
                  value={moveForm.kind}
                  onChange={(e) =>
                    setMoveForm((f) => ({
                      ...f,
                      kind: e.target.value as (typeof WASTE_KINDS)[number],
                    }))
                  }
                >
                  {WASTE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`kind_${kind}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-batch">{t("batch")}</Label>
                <Input
                  id="st-batch"
                  dir="ltr"
                  value={moveForm.batch_no}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, batch_no: e.target.value }))
                  }
                  placeholder={t("batch_optional")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-reason">{t("reason")}</Label>
                <Input
                  id="st-reason"
                  value={moveForm.reason}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  placeholder={t("reason_placeholder")}
                />
              </div>
            </>
          ) : null}
        </div>

        {/* Waste without a reason is unexplained shrinkage with a label; the button says so. */}
        {mode === "waste" && moveForm.reason.trim() === "" ? (
          <p className="text-muted-foreground text-xs">
            {t("reason_required")}
          </p>
        ) : null}

        <Button
          disabled={!canSubmitMove || submitMove.isPending}
          onClick={() => submitMove.mutate()}
        >
          {submitMove.isPending ? tCommon("saving") : t("save_movement")}
        </Button>
      </CafeSection>

      <CafeSection title={t("transfer_title")} description={t("transfer_hint")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="tr-product">{t("item")}</Label>
            <select
              id="tr-product"
              className={cafeSelectClass}
              value={transfer.product_id}
              onChange={(e) =>
                setTransfer((f) => ({ ...f, product_id: e.target.value }))
              }
            >
              <option value="">{t("choose_item")}</option>
              {items.map((row) => (
                <option
                  key={`tr-${row.subject_id}`}
                  value={String(row.subject_id)}
                >
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-from">{t("from_store")}</Label>
            <select
              id="tr-from"
              className={cafeSelectClass}
              value={transfer.from}
              onChange={(e) =>
                setTransfer((f) => ({ ...f, from: e.target.value }))
              }
            >
              <option value="">{t("choose_store")}</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-to">{t("to_store")}</Label>
            <select
              id="tr-to"
              className={cafeSelectClass}
              value={transfer.to}
              onChange={(e) =>
                setTransfer((f) => ({ ...f, to: e.target.value }))
              }
            >
              <option value="">{t("choose_store")}</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-qty">{t("quantity")}</Label>
            <Input
              id="tr-qty"
              type="number"
              min={0}
              step="0.001"
              value={transfer.quantity}
              onChange={(e) =>
                setTransfer((f) => ({ ...f, quantity: e.target.value }))
              }
            />
          </div>
        </div>
        <Button
          variant="outline"
          disabled={
            submitTransfer.isPending ||
            transfer.product_id === "" ||
            transfer.from === "" ||
            transfer.to === "" ||
            transfer.from === transfer.to ||
            Number(transfer.quantity) <= 0
          }
          onClick={() => submitTransfer.mutate()}
        >
          {submitTransfer.isPending ? tCommon("saving") : t("transfer")}
        </Button>
      </CafeSection>

      <CafeSection title={t("stock_title")} description={t("stock_hint")}>
        {items.length === 0 ? (
          <CafeEmptyState message={t("empty")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead>{t("on_hand")}</TableHead>
                  <TableHead>{t("avg_cost")}</TableHead>
                  <TableHead>{t("value")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={`${row.subject_type}-${row.subject_id}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.qty_on_hand), locale)}{" "}
                      {row.base_unit ?? row.unit ?? ""}
                    </TableCell>
                    <TableCell>
                      <MoneyText amount={Math.round(row.avg_cost_minor)} />
                    </TableCell>
                    <TableCell>
                      <MoneyText
                        amount={Math.round(
                          row.qty_on_hand * row.avg_cost_minor,
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      {row.low ? (
                        <Badge variant="destructive">{t("low")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("ok")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>

      <CafeSection title={t("opening_title")} description={t("opening_hint")}>
        <div className="space-y-2">
          <Label htmlFor="opening-body">{t("opening_body")}</Label>
          <textarea
            id="opening-body"
            className="border-input bg-background min-h-32 w-full rounded-md border px-3 py-2 font-mono text-xs"
            dir="ltr"
            spellCheck={false}
            placeholder={"نام کالا,مقدار,بهای واحد\nشیر,12,35000"}
            value={opening}
            onChange={(e) => {
              setOpening(e.target.value);
              setOpeningResult(null);
            }}
          />
          <p className="text-muted-foreground text-xs">
            {t("opening_columns")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={opening.trim() === "" || previewOpening.isPending}
              onClick={() => previewOpening.mutate()}
            >
              {previewOpening.isPending
                ? tCommon("saving")
                : t("opening_preview")}
            </Button>
            <Button
              disabled={
                opening.trim() === "" ||
                commitOpening.isPending ||
                !openingResult ||
                (openingResult.ready ?? 0) === 0
              }
              onClick={() => commitOpening.mutate()}
            >
              {commitOpening.isPending
                ? tCommon("saving")
                : t("opening_commit")}
            </Button>
          </div>

          {openingResult ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                {t("opening_summary", {
                  ready: toLocaleDigits(
                    String(openingResult.ready ?? openingResult.received ?? 0),
                    locale,
                  ),
                  total: toLocaleDigits(
                    String(openingResult.total ?? openingResult.received ?? 0),
                    locale,
                  ),
                })}
              </p>
              {(openingResult.errors ?? openingResult.failed ?? []).length >
              0 ? (
                <ul className="space-y-1">
                  {(openingResult.errors ?? openingResult.failed ?? []).map(
                    (row) => (
                      <li
                        key={`${row.line}-${row.message}`}
                        className="text-destructive text-xs"
                      >
                        {t("opening_line", {
                          line: toLocaleDigits(String(row.line), locale),
                        })}{" "}
                        — {row.message}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </CafeSection>

      <CafeSection
        title={t("waste_report_title")}
        description={t("waste_report_hint")}
      >
        {(wasteReport.data?.by_kind ?? []).length === 0 ? (
          <CafeEmptyState message={t("waste_report_empty")} />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(wasteReport.data?.by_kind ?? []).map((row) => (
                <div key={row.kind} className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">
                    {row.kind === "unspecified"
                      ? t("waste_unspecified")
                      : t(`kind_${row.kind}` as "kind_waste")}
                  </p>
                  <p className="text-lg font-semibold">
                    <MoneyText amount={row.value_minor} />
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {row.share_percent === null
                      ? "—"
                      : `${toLocaleDigits(String(row.share_percent), locale)}٪`}
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("item")}</TableHead>
                    <TableHead>{t("quantity")}</TableHead>
                    <TableHead>{t("waste_value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(wasteReport.data?.by_item ?? []).map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {toLocaleDigits(
                          String(Math.round(row.quantity * 1000) / 1000),
                          locale,
                        )}
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={row.value_minor} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-muted-foreground text-xs">
              {t("waste_report_period", {
                from: toLocaleDigits(wasteReport.data?.from ?? "", locale),
                to: toLocaleDigits(wasteReport.data?.to ?? "", locale),
              })}
            </p>
          </div>
        )}
      </CafeSection>

      <CafeSection title={t("expiring_title")} description={t("expiring_hint")}>
        {(expiring.data ?? []).length === 0 ? (
          <CafeEmptyState message={t("nothing_expiring")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead>{t("batch")}</TableHead>
                  <TableHead>{t("quantity")}</TableHead>
                  <TableHead>{t("expires_on")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(expiring.data ?? []).map((row) => (
                  <TableRow key={row.batch_id}>
                    <TableCell>{row.product_name ?? "—"}</TableCell>
                    <TableCell dir="ltr">{row.batch_no ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.quantity), locale)}{" "}
                      {row.unit ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.expired ? "destructive" : "secondary"}
                      >
                        {row.expired
                          ? t("expired")
                          : t("days_left", {
                              days: toLocaleDigits(
                                String(row.days_left),
                                locale,
                              ),
                            })}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>

      <CafeSection title={t("reorder_title")} description={t("reorder_hint")}>
        {(reorder.data ?? []).length === 0 ? (
          <CafeEmptyState message={t("nothing_to_buy")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead>{t("on_hand")}</TableHead>
                  <TableHead>{t("reorder_point")}</TableHead>
                  <TableHead>{t("suggested")}</TableHead>
                  <TableHead>{t("estimated_cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reorder.data ?? []).map((row) => (
                  <TableRow key={row.product_id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.on_hand), locale)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.reorder_point), locale)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.packs), locale)}{" "}
                      {row.purchase_unit ?? ""}
                    </TableCell>
                    <TableCell>
                      <MoneyText
                        amount={Math.round(row.estimated_cost_minor)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>
    </CafeAdminShell>
  );
}
