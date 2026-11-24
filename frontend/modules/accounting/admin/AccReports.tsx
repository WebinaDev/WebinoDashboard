'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocaleDatePicker } from '@/components/ui/locale-date-picker';
import { useLocale } from '@/hooks/use-locale-next';

type TrialRow = { code: string; name: string; debit: number; credit: number; balance: number };
type BSRow = { code: string; name: string; balance: number };
type BSData = { assets: BSRow[]; liabilities_equity: BSRow[] };
type PLRow = { code: string; name: string; type: string; balance: number };

type ReportType = 'trial_balance' | 'balance_sheet' | 'profit_loss';

export default function AccReports() {
  const t = useTranslations();

  const [tab, setTab] = useState<ReportType>('trial_balance');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params: Record<string, string> = { type: tab };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await apiClient.get('/v1/erp-accounting/reports', { params });
      setData(unwrapData<unknown>(res));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('auto.accounting_AccReports.s_6d30a771')}</h2>

      <Tabs
        value={tab}
        onValueChange={(v) => { setTab(v as ReportType); setData(null); }}
      >
        <TabsList>
          <TabsTrigger value="trial_balance">{t('auto.accounting_AccReports.s_14bbcb45')}</TabsTrigger>
          <TabsTrigger value="balance_sheet">{t('auto.accounting_AccReports.s_fa51c153')}</TabsTrigger>
          <TabsTrigger value="profit_loss">{t('auto.accounting_AccReports.s_5782095f')}</TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReports.s_46e7250c')}</label>
            <LocaleDatePicker value={from} onChange={setFrom} />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReports.s_1669071d')}</label>
            <LocaleDatePicker value={to} onChange={setTo} />
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? t('auto.accounting_AccReports.s_51617f69') : t('auto.accounting_AccReports.s_de84d65e')}
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
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReports.s_075aefae')}</p>
      )}
    </div>
  );
}

/* ─── Trial Balance ─── */

function TrialBalanceTable({ rows }: { rows: TrialRow[] }) {
  const t = useTranslations();
  const { formatNumber } = useLocale();

  if (!Array.isArray(rows) || rows.length === 0)
    return <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReports.s_5a395258')}</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_022863c2')}</th>
            <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_45dd06ba')}</th>
            <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccReports.s_7146b67c')}</th>
            <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccReports.s_15f88fc8')}</th>
            <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccReports.s_64f59511')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">{formatNumber(Number(r.debit))}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">{formatNumber(Number(r.credit))}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">{formatNumber(Number(r.balance))}</td>
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

  if (!data || typeof data !== 'object')
    return <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReports.s_5a395258')}</p>;

  const assets = Array.isArray(data.assets) ? data.assets : [];
  const liabilities = Array.isArray(data.liabilities_equity) ? data.liabilities_equity : [];

  return (
    <div className="space-y-6">
      <BSSection title={t('auto.accounting_AccReports.s_0d3b2f94')} rows={assets} />
      <BSSection title={t('auto.accounting_AccReports.s_3060450a')} rows={liabilities} />
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
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReports.s_5a395258')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_022863c2')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_45dd06ba')}</th>
                <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccReports.s_64f59511')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
                  <td className="px-2 py-1.5">{r.name}</td>
                  <td className="px-2 py-1.5 text-end tabular-nums">{formatNumber(Number(r.balance))}</td>
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
    return <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReports.s_5a395258')}</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[500px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_022863c2')}</th>
            <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_45dd06ba')}</th>
            <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccReports.s_d2e35a1f')}</th>
            <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccReports.s_64f59511')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="px-2 py-1.5 tabular-nums">{r.code}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5">{r.type}</td>
              <td className="px-2 py-1.5 text-end tabular-nums">{formatNumber(Number(r.balance))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
