"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import apiClient from "@/features/modules/accounting/lib/api-client";
import {
  unwrapData,
  getAxiosMessage,
} from "@/features/modules/accounting/lib/api-helpers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocaleDatePicker } from "@/components/ui/locale-date-picker";
import { useLocale } from "@/hooks/use-locale-next";

type TrialRow = {
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
};
type BSRow = { code: string; name: string; balance: number };
type BSData = { assets: BSRow[]; liabilities_equity: BSRow[] };
type PLRow = { code: string; name: string; type: string; balance: number };

type ReportType = "trial_balance" | "balance_sheet" | "profit_loss";

export default function AccReports() {
  const t = useTranslations();

  const [tab, setTab] = useState<ReportType>("trial_balance");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  // The ledger carries a branch now, so a report can be narrowed to one shop. Empty means all.
  const [branchId, setBranchId] = useState("");
  const [includeUnassigned, setIncludeUnassigned] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The same params the screen uses, so the file cannot disagree with the page. */
  const reportParams = (): Record<string, string> => {
    const params: Record<string, string> = { type: tab };
    if (from) params.from = from;
    if (to) params.to = to;
    if (branchId.trim() !== "") params.branch_id = branchId.trim();
    if (branchId.trim() !== "" && includeUnassigned)
      params.include_unassigned = "1";
    return params;
  };

  /**
   * Download through the client so the auth token comes along; a bare <a href> hits the API
   * unauthenticated and the browser saves a 401 page as "report.csv".
   */
  const downloadCsv = async () => {
    setError(null);
    try {
      const blob = await apiClient.download(
        "/v1/erp-accounting/reports/export",
        {
          params: reportParams(),
        },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `accounting-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  };

  /**
   * The print view needs a real navigation to run through the API middleware, so the request is
   * made with fetch, turned into a blob and opened in a new tab; the user then prints that tab,
   * which contains the statement and nothing else.
   */
  const printReport = async () => {
    setError(null);
    try {
      const blob = await apiClient.download(
        "/v1/erp-accounting/reports/print",
        {
          params: reportParams(),
        },
      );
      const url = URL.createObjectURL(new Blob([blob], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await apiClient.get("/v1/erp-accounting/reports", {
        params: reportParams(),
      });
      setData(unwrapData<unknown>(res));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">
        {t("auto.accounting_AccReports.s_6d30a771")}
      </h2>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as ReportType);
          setData(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="trial_balance">
            {t("auto.accounting_AccReports.s_14bbcb45")}
          </TabsTrigger>
          <TabsTrigger value="balance_sheet">
            {t("auto.accounting_AccReports.s_fa51c153")}
          </TabsTrigger>
          <TabsTrigger value="profit_loss">
            {t("auto.accounting_AccReports.s_5782095f")}
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">
              {t("auto.accounting_AccReports.s_46e7250c")}
            </label>
            <LocaleDatePicker value={from} onChange={setFrom} />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">
              {t("auto.accounting_AccReports.s_1669071d")}
            </label>
            <LocaleDatePicker value={to} onChange={setTo} />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-sm font-medium">
              {t("accounting_reports_branch")}
            </label>
            <input
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              inputMode="numeric"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder={t("accounting_reports_all_branches")}
            />
          </div>
          {branchId.trim() !== "" ? (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={includeUnassigned}
                onChange={(e) => setIncludeUnassigned(e.target.checked)}
              />
              {t("accounting_reports_include_unassigned")}
            </label>
          ) : null}
          <Button onClick={() => void load()} disabled={loading}>
            {loading
              ? t("auto.accounting_AccReports.s_51617f69")
              : t("auto.accounting_AccReports.s_de84d65e")}
          </Button>
          {/* An accountant needs the file and the paper, not a screenshot of a table. */}
          <Button variant="outline" onClick={() => void downloadCsv()}>
            {t("accounting_report_export.csv")}
          </Button>
          <Button variant="outline" onClick={() => void printReport()}>
            {t("accounting_report_export.print")}
          </Button>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <TabsContent value="trial_balance">
          {data ? <TrialBalanceTable rows={data as TrialRow[]} /> : null}
        </TabsContent>
        <TabsContent value="balance_sheet">
          {data ? <BalanceSheetView data={data as BSData} /> : null}
        </TabsContent>
        <TabsContent value="profit_loss">
          {data ? <ProfitLossTable rows={data as PLRow[]} /> : null}
        </TabsContent>
      </Tabs>

      {!loading && !error && !data && (
        <p className="text-sm text-muted-foreground">
          {t("auto.accounting_AccReports.s_075aefae")}
        </p>
      )}
    </div>
  );
}

/* ─── Trial Balance ─── */

function TrialBalanceTable({ rows }: { rows: TrialRow[] }) {
  const t = useTranslations();
  const { formatNumber } = useLocale();

  if (!Array.isArray(rows) || rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {t("auto.accounting_AccReports.s_5a395258")}
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-2 py-2 text-start font-medium">
              {t("auto.accounting_AccReports.s_022863c2")}
            </th>
            <th className="px-2 py-2 text-start font-medium">
              {t("auto.accounting_AccReports.s_45dd06ba")}
            </th>
            <th className="px-2 py-2 text-end font-medium">
              {t("auto.accounting_AccReports.s_7146b67c")}
            </th>
            <th className="px-2 py-2 text-end font-medium">
              {t("auto.accounting_AccReports.s_15f88fc8")}
            </th>
            <th className="px-2 py-2 text-end font-medium">
              {t("auto.accounting_AccReports.s_64f59511")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">
                {formatNumber(Number(r.debit))}
              </td>
              <td className="px-2 py-1.5 text-end tabular-nums">
                {formatNumber(Number(r.credit))}
              </td>
              <td className="px-2 py-1.5 text-end tabular-nums">
                {formatNumber(Number(r.balance))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Balance Sheet ─── */

function BalanceSheetView({ data }: { data: BSData }) {
  const t = useTranslations();

  if (!data || typeof data !== "object")
    return (
      <p className="text-sm text-muted-foreground">
        {t("auto.accounting_AccReports.s_5a395258")}
      </p>
    );

  const assets = Array.isArray(data.assets) ? data.assets : [];
  const liabilities = Array.isArray(data.liabilities_equity)
    ? data.liabilities_equity
    : [];

  return (
    <div className="space-y-6">
      <BSSection
        title={t("auto.accounting_AccReports.s_0d3b2f94")}
        rows={assets}
      />
      <BSSection
        title={t("auto.accounting_AccReports.s_3060450a")}
        rows={liabilities}
      />
    </div>
  );
}

function BSSection({ title, rows }: { title: string; rows: BSRow[] }) {
  const t = useTranslations();
  const { formatNumber } = useLocale();

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("auto.accounting_AccReports.s_5a395258")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">
                  {t("auto.accounting_AccReports.s_022863c2")}
                </th>
                <th className="px-2 py-2 text-start font-medium">
                  {t("auto.accounting_AccReports.s_45dd06ba")}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {t("auto.accounting_AccReports.s_64f59511")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
                  <td className="px-2 py-1.5">{r.name}</td>
                  <td className="px-2 py-1.5 text-end tabular-nums">
                    {formatNumber(Number(r.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Profit & Loss ─── */

function ProfitLossTable({ rows }: { rows: PLRow[] }) {
  const t = useTranslations();
  const { formatNumber } = useLocale();

  if (!Array.isArray(rows) || rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {t("auto.accounting_AccReports.s_5a395258")}
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[500px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-2 py-2 text-start font-medium">
              {t("auto.accounting_AccReports.s_022863c2")}
            </th>
            <th className="px-2 py-2 text-start font-medium">
              {t("auto.accounting_AccReports.s_45dd06ba")}
            </th>
            <th className="px-2 py-2 text-start font-medium">
              {t("auto.accounting_AccReports.s_d2e35a1f")}
            </th>
            <th className="px-2 py-2 text-end font-medium">
              {t("auto.accounting_AccReports.s_64f59511")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5">{r.type}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">
                {formatNumber(Number(r.balance))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
