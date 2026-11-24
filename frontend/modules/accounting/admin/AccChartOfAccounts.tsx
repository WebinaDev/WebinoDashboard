'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Account = {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  type: string;
  is_postable: boolean;
  depth: number;
};

type FiscalYear = { id: number; title: string };

export default function AccChartOfAccounts() {
  const t = useTranslations();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fys, setFys] = useState<FiscalYear[]>([]);
  const [fyId, setFyId] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } })
      .then((r) => setFys(normalizeListPayload(r.data) as unknown as FiscalYear[]))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (fyId !== 'all') params.fiscal_year_id = fyId;
      const res = await apiClient.get('/v1/erp-accounting/chart', { params });
      setAccounts(unwrapData<Account[]>(res));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccChartOfAccounts.s_a14f1ab2')}</h2>
        <div className="flex items-center gap-2">
          <Select value={fyId} onValueChange={setFyId}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('auto.accounting_AccChartOfAccounts.s_79432b0c')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auto.accounting_AccChartOfAccounts.s_55bf7b08')}</SelectItem>
              {fys.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {t('auto.accounting_AccChartOfAccounts.s_182b1c89')}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccChartOfAccounts.s_51617f69')}</p>}

      {!loading && accounts.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccChartOfAccounts.s_022863c2')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccChartOfAccounts.s_ddbef6fb')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccChartOfAccounts.s_d2e35a1f')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccChartOfAccounts.s_3d8c208d')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{a.code}</td>
                  <td className="px-2 py-1.5">
                    <span style={{ paddingInlineStart: a.depth * 24 }}>{a.name}</span>
                  </td>
                  <td className="px-2 py-1.5">{a.type}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={a.is_postable ? 'default' : 'outline'}>
                      {a.is_postable ? t('auto.accounting_AccChartOfAccounts.s_afcb410b') : t('auto.accounting_AccChartOfAccounts.s_a7b8355e')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccChartOfAccounts.s_09a671d4')}</p>
      )}
    </div>
  );
}
