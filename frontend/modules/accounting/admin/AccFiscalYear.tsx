'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type FiscalYear = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

export default function AccFiscalYear() {
  const t = useTranslations();

  const [rows, setRows] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } });
      setRows(normalizeListPayload(res.data) as unknown as FiscalYear[]);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccFiscalYear.s_79432b0c')}</h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {t('auto.accounting_AccFiscalYear.s_182b1c89')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccFiscalYear.s_51617f69')}</p>}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_acc84041')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_1a9bdb20')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_7f1e4c29')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_d13a2741')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_55518965')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fy) => (
                <tr key={fy.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{fy.id}</td>
                  <td className="px-2 py-1.5">{fy.title}</td>
                  <td className="px-2 py-1.5">{fy.start_date}</td>
                  <td className="px-2 py-1.5">{fy.end_date}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={fy.is_active ? 'default' : 'outline'}>
                      {fy.is_active ? t('auto.accounting_AccFiscalYear.s_6f637966') : t('auto.accounting_AccFiscalYear.s_d9ba4168')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccFiscalYear.s_83c22977')}</p>
      )}
    </div>
  );
}
