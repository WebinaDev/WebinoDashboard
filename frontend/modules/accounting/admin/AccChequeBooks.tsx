"use client";

import { useTranslations } from "next-intl";
import { useState, useCallback, useEffect } from "react";
import apiClient from "@/features/modules/accounting/lib/api-client";
import { getAxiosMessage } from "@/features/modules/accounting/lib/api-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale-next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type LeafStatus = "unused" | "issued" | "cancelled" | "lost";

type Leaf = {
  leaf_number: number;
  status: LeafStatus;
  amount: number | null;
  due_date: string | null;
  issued_on: string | null;
  person_id: number | null;
  check_id: number | null;
  note: string | null;
};

type BookRow = {
  id: number;
  title: string;
  bank: string | null;
  cash_account: string | null;
  series_from: string;
  series_to: string;
  is_active: boolean;
  leaves: {
    total: number;
    unused: number;
    issued: number;
    cancelled: number;
    lost: number;
  };
};

type Reconcile = {
  book: {
    id: number;
    title: string;
    bank: string | null;
    series_from: string;
    series_to: string;
    is_active: boolean;
  };
  totals: {
    leaves: number;
    unused: number;
    issued: number;
    cancelled: number;
    lost: number;
    unaccounted: number;
    issued_value: number;
    next_leaf: number | null;
  };
  leaves: Leaf[];
};

const LEAF_BADGE: Record<
  LeafStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  unused: "outline",
  issued: "default",
  cancelled: "secondary",
  lost: "destructive",
};

const unwrap = (raw: unknown): unknown => {
  const body = raw as Record<string, unknown>;
  return body?.data ?? raw;
};

export default function AccChequeBooks() {
  const t = useTranslations();
  const { formatNumber, formatDate } = useLocale();

  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openBook, setOpenBook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    bank: "",
    series_from: "",
    series_to: "",
    void_from: "",
    void_to: "",
    notes: "",
  });

  const [detail, setDetail] = useState<Reconcile | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issue, setIssue] = useState({
    leaf_number: "",
    amount: "",
    due_date: "",
    note: "",
  });

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/v1/erp-accounting/cheque-books");
      setBooks((unwrap(res.data) as BookRow[]) ?? []);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const res = await apiClient.get(
        `/v1/erp-accounting/cheque-books/${id}/reconcile`,
      );
      setDetail(unwrap(res.data) as Reconcile);
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  }, []);

  const saveBook = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await apiClient.post("/v1/erp-accounting/cheque-books", {
        title: form.title,
        bank: form.bank || null,
        series_from: form.series_from,
        series_to: form.series_to,
        void_from: form.void_from ? Number(form.void_from) : null,
        void_to: form.void_to ? Number(form.void_to) : null,
        notes: form.notes || null,
      });
      setOpenBook(false);
      setForm({
        title: "",
        bank: "",
        series_from: "",
        series_to: "",
        void_from: "",
        void_to: "",
        notes: "",
      });
      await fetchBooks();
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const submitIssue = async () => {
    if (!detail) return;
    setSaving(true);
    setIssueError(null);
    try {
      await apiClient.post(
        `/v1/erp-accounting/cheque-books/${detail.book.id}/issue`,
        {
          leaf_number: Number(issue.leaf_number),
          amount: Number(issue.amount),
          due_date: issue.due_date || null,
          note: issue.note || null,
        },
      );
      setIssueOpen(false);
      setIssue({ leaf_number: "", amount: "", due_date: "", note: "" });
      await loadDetail(detail.book.id);
      await fetchBooks();
    } catch (e) {
      setIssueError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const spoil = async (leafNumber: number, status: "cancelled" | "lost") => {
    if (!detail) return;
    try {
      await apiClient.post(
        `/v1/erp-accounting/cheque-books/${detail.book.id}/leaves/${leafNumber}/spoil`,
        { status },
      );
      await loadDetail(detail.book.id);
      await fetchBooks();
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={() => {
            setFormError(null);
            setOpenBook(true);
          }}
        >
          {t("accounting_cheque_books.open_book")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">
          {t("accounting_cheque_books.loading")}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.title")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.series")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.bank")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.used")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.free")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.missing")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.status")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("accounting_cheque_books.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className="border-b">
                <td className="px-3 py-2">{book.title}</td>
                <td className="px-3 py-2 tabular-nums" dir="ltr">
                  {book.series_from} – {book.series_to}
                </td>
                <td className="px-3 py-2">{book.bank ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatNumber(book.leaves.issued)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatNumber(book.leaves.unused)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {/* Lost leaves are the number the bank asks for when you stop payment. */}
                  {book.leaves.lost > 0 ? (
                    <span className="text-destructive font-medium">
                      {formatNumber(book.leaves.lost)}
                    </span>
                  ) : (
                    formatNumber(0)
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={book.is_active ? "default" : "outline"}>
                    {book.is_active
                      ? t("accounting_cheque_books.active")
                      : t("accounting_cheque_books.closed")}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadDetail(book.id)}
                  >
                    {t("accounting_cheque_books.leaves")}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && books.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  {t("accounting_cheque_books.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={openBook} onOpenChange={setOpenBook}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("accounting_cheque_books.open_book")}</DialogTitle>
            <DialogDescription>
              {t("accounting_cheque_books.open_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.title")}
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.bank")}
              </label>
              <Input
                value={form.bank}
                onChange={(e) => setForm({ ...form, bank: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("accounting_cheque_books.series_from")}
                </label>
                <Input
                  dir="ltr"
                  value={form.series_from}
                  onChange={(e) =>
                    setForm({ ...form, series_from: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("accounting_cheque_books.series_to")}
                </label>
                <Input
                  dir="ltr"
                  value={form.series_to}
                  onChange={(e) =>
                    setForm({ ...form, series_to: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("accounting_cheque_books.void_from")}
                </label>
                <Input
                  dir="ltr"
                  value={form.void_from}
                  onChange={(e) =>
                    setForm({ ...form, void_from: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("accounting_cheque_books.void_to")}
                </label>
                <Input
                  dir="ltr"
                  value={form.void_to}
                  onChange={(e) =>
                    setForm({ ...form, void_to: e.target.value })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("accounting_cheque_books.void_hint")}
            </p>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenBook(false)}>
              {t("accounting_cheque_books.cancel")}
            </Button>
            <Button
              onClick={() => void saveBook()}
              disabled={
                saving || !form.title || !form.series_from || !form.series_to
              }
            >
              {saving
                ? t("accounting_cheque_books.saving")
                : t("accounting_cheque_books.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.book.title}</DialogTitle>
            <DialogDescription>
              {detail ? (
                <>
                  <span dir="ltr" className="tabular-nums">
                    {detail.book.series_from} – {detail.book.series_to}
                  </span>
                  {" · "}
                  {t("accounting_cheque_books.totals", {
                    issued: formatNumber(detail.totals.issued),
                    unused: formatNumber(detail.totals.unused),
                    cancelled: formatNumber(detail.totals.cancelled),
                    lost: formatNumber(detail.totals.lost),
                  })}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {t("accounting_cheque_books.issued_value")}:{" "}
              <span className="tabular-nums font-medium">
                {formatNumber(detail?.totals.issued_value ?? 0)}
              </span>
            </p>
            <Button
              size="sm"
              onClick={() => {
                setIssueError(null);
                setIssueOpen(true);
              }}
            >
              {t("accounting_cheque_books.issue")}
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="border-b">
                  <th className="px-3 py-2 text-start font-medium">
                    {t("accounting_cheque_books.leaf")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("accounting_cheque_books.status")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("accounting_cheque_books.amount")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("accounting_cheque_books.due")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("accounting_cheque_books.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail?.leaves.map((leaf) => (
                  <tr key={leaf.leaf_number} className="border-b">
                    <td className="px-3 py-2 tabular-nums" dir="ltr">
                      {leaf.leaf_number}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={LEAF_BADGE[leaf.status]}>
                        {t(`accounting_cheque_books.leaf_${leaf.status}`)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {leaf.amount !== null ? formatNumber(leaf.amount) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {leaf.due_date
                        ? formatDate(leaf.due_date) || leaf.due_date
                        : "—"}
                    </td>
                    <td className="px-3 py-2 gap-x-1 rtl:gap-x-reverse">
                      {leaf.status === "unused" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIssue({
                                leaf_number: String(leaf.leaf_number),
                                amount: "",
                                due_date: "",
                                note: "",
                              });
                              setIssueError(null);
                              setIssueOpen(true);
                            }}
                          >
                            {t("accounting_cheque_books.issue")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void spoil(leaf.leaf_number, "cancelled")
                            }
                          >
                            {t("accounting_cheque_books.spoil")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => void spoil(leaf.leaf_number, "lost")}
                          >
                            {t("accounting_cheque_books.mark_lost")}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("accounting_cheque_books.issue")}</DialogTitle>
            <DialogDescription>
              {t("accounting_cheque_books.issue_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.leaf")}
              </label>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={issue.leaf_number}
                onChange={(e) =>
                  setIssue({ ...issue, leaf_number: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.amount")}
              </label>
              <Input
                dir="ltr"
                type="number"
                value={issue.amount}
                onChange={(e) => setIssue({ ...issue, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.due")}
              </label>
              <Input
                dir="ltr"
                type="date"
                value={issue.due_date}
                onChange={(e) =>
                  setIssue({ ...issue, due_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("accounting_cheque_books.note")}
              </label>
              <Input
                value={issue.note}
                onChange={(e) => setIssue({ ...issue, note: e.target.value })}
              />
            </div>
            {issueError && (
              <p className="text-sm text-destructive">{issueError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              {t("accounting_cheque_books.cancel")}
            </Button>
            <Button
              onClick={() => void submitIssue()}
              disabled={
                saving || !issue.leaf_number || !(Number(issue.amount) > 0)
              }
            >
              {saving
                ? t("accounting_cheque_books.saving")
                : t("accounting_cheque_books.issue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
