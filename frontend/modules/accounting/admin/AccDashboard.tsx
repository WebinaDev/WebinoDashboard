'use client';

import { useTranslations } from 'next-intl';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccountingGet } from './useAccountingGet';

const LINK_DEFS: { segment: string; titleKey: string; desc: string }[] = [
  { segment: 'chart', titleKey: 'auto.accounting_AccDashboard.s_a14f1ab2', desc: 'Chart of accounts' },
  { segment: 'journals', titleKey: 'auto.accounting_AccDashboard.s_1e02b463', desc: 'Journals' },
  { segment: 'ledger', titleKey: 'auto.accounting_AccDashboard.s_755d64e1', desc: 'Ledger' },
  { segment: 'reports', titleKey: 'auto.accounting_AccDashboard.s_6d30a771', desc: 'Reports' },
  { segment: 'fiscal-year', titleKey: 'auto.accounting_AccDashboard.s_79432b0c', desc: 'Fiscal years' },
  { segment: 'settings', titleKey: 'auto.accounting_AccDashboard.s_98bfeaf6', desc: 'Settings' },
  { segment: 'persons', titleKey: 'auto.accounting_AccDashboard.s_5daff49c', desc: 'Persons' },
  { segment: 'products', titleKey: 'auto.accounting_AccDashboard.s_fe915b95', desc: 'Products' },
  { segment: 'invoices', titleKey: 'auto.accounting_AccDashboard.s_841c3902', desc: 'Invoices' },
  { segment: 'cash-accounts', titleKey: 'auto.accounting_AccDashboard.s_52b0b69a', desc: 'Cash accounts' },
  { segment: 'receipts', titleKey: 'auto.accounting_AccDashboard.s_8a9ea012', desc: 'Receipts' },
  { segment: 'checks', titleKey: 'auto.accounting_AccDashboard.s_024e2588', desc: 'Checks' },
  { segment: 'warehouses', titleKey: 'auto.accounting_AccDashboard.s_42e85570', desc: 'Warehouses' },
  { segment: 'warehouse-stock', titleKey: 'auto.accounting_AccDashboard.s_55645b2c', desc: 'Stock' },
  { segment: 'warehouse-inbound', titleKey: 'auto.accounting_AccDashboard.s_f0fab4bb', desc: 'Inbound' },
  { segment: 'warehouse-outbound', titleKey: 'auto.accounting_AccDashboard.s_43ad047f', desc: 'Outbound' },
  { segment: 'warehouse-audit', titleKey: 'auto.accounting_AccDashboard.s_dc7c2b32', desc: 'Audit' },
];

export default function AccDashboard() {
  const t = useTranslations();
  const links = LINK_DEFS.map((l) => ({ ...l, title: t(l.titleKey) }));

  const pathname = usePathname();
  const locale = pathname?.match(/^\/(fa|en)/)?.[1] ?? 'fa';
  const base = `/dashboard/accounting`;
  const { data, error, loading, reload } = useAccountingGet('/v1/erp-accounting/summary');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('auto.accounting_AccDashboard.s_de875aaf')}</h2>
          <p className="text-xs text-muted-foreground" dir="ltr">
            GET /v1/erp-accounting/summary
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          {t('auto.accounting_AccDashboard.s_182b1c89')}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data && typeof data === 'object' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
            <Card key={k}>
              <CardHeader className="py-3">
                <CardDescription className="text-xs">{k}</CardDescription>
                <CardTitle className="text-xl tabular-nums">{String(v)}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        !loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccDashboard.s_26b4ab14')}</p>
      )}

      <div>
        <h3 className="mb-3 text-sm font-medium">{t('auto.accounting_AccDashboard.s_823f9e11')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => (
            <Link key={l.segment} href={l.segment ? `${base}/${l.segment}` : base} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="text-base">{l.title}</CardTitle>
                  <CardDescription dir="ltr">{l.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
