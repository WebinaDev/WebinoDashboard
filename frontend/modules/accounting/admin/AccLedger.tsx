'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LocaleDatePicker } from '@/components/ui/locale-date-picker';
import { useLocale } from '@/hooks/use-locale-next';

type Account = { id: number; code: string; name: string };

type LedgerLine = {
  journal_entry_id: number;
  document_no: string;
  document_date: string;
  account_name: string;
  debit: number;
  credit: number;
  line_description: string;
};

type LedgerData = {
  lines: LedgerLine[];
  totals: { debit: number; credit: number };
};

export default function AccLedger() {
  const t = useTranslations();
  const { formatNumber, formatDate } = useLocale();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/v1/erp-accounting/chart')
      .then((r) => {
        const list = unwrapData<Account[]>(r);
        setAccounts(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { account_id: accountId };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await apiClient.get('/v1/erp-accounting/ledger', { params });
      setData(unwrapData<LedgerData>(res));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('auto.accounting_AccLedger.s_8b0100b7')}</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccLedger.s_fdadd003')}</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder={t('auto.accounting_AccLedger.s_d37d351d')} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccLedger.s_46e7250c')}</label>
          <LocaleDatePicker value={from} onChange={setFrom} />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccLedger.s_1669071d')}</label>
          <LocaleDatePicker value={to} onChange={setTo} />
        </div>
        <Button onClick={() => void load()} disabled={!accountId || loading}>
          {loading ? t('auto.accounting_AccLedger.s_51617f69') : t('auto.accounting_AccLedger.s_5b4caa8a')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccLedger.s_2a97e3c5')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccLedger.s_c9ce1c29')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccLedger.s_217c8491')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccLedger.s_fdadd003')}</th>
                <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccLedger.s_7146b67c')}</th>
                <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccLedger.s_15f88fc8')}</th>
                <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccLedger.s_64f59511')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccLedger.s_b11813ac')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{l.document_no}</td>
                  <td className="px-2 py-1.5 tabular-nums">{l.journal_entry_id}</td>
                  <td className="px-2 py-1.5">{formatDate(String(l.document_date)) || l.document_date}</td>
                  <td className="px-2 py-1.5">{l.account_name}</td>
                  <td className="px-2 py-1.5 text-end tabular-nums">
                    {formatNumber(Number(l.debit))}
                  </td>
                  <td className="px-2 py-1.5 text-end tabular-nums">
                    {formatNumber(Number(l.credit))}
                  </td>
                  <td className="px-2 py-1.5 text-end tabular-nums">
                    {formatNumber((Number(l.debit) || 0) - (Number(l.credit) || 0))}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1.5">{l.line_description}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td colSpan={4} className="px-2 py-2 text-start">{t('auto.accounting_AccLedger.s_b1f76dbb')}</td>
                <td className="px-2 py-2 text-end tabular-nums">
                  {formatNumber(Number(data.totals.debit))}
                </td>
                <td className="px-2 py-2 text-end tabular-nums">
                  {formatNumber(Number(data.totals.credit))}
                </td>
                <td className="px-2 py-2 text-end tabular-nums">
                  {formatNumber((Number(data.totals.debit) || 0) - (Number(data.totals.credit) || 0))}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && !data && (
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccLedger.s_59566367')}</p>
      )}
    </div>
  );
}
