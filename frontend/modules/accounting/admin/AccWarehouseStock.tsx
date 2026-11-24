'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale-next';

type Warehouse = { id: number; name: string };

type StockRow = {
  id?: number;
  warehouse?: { name?: string };
  product?: { name?: string };
  quantity: number;
  reorder_point: number;
};

function parsePaginated<T>(axiosData: unknown) {
  const obj = axiosData as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return { data: [] as T[], page: 1, pageCount: 1, total: 0 };
  let envelope = obj;
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) envelope = inner;
  }
  const list = (Array.isArray(envelope.data) ? envelope.data : []) as T[];
  const meta = (envelope.meta && typeof envelope.meta === 'object' ? envelope.meta : envelope) as Record<string, unknown>;
  return {
    data: list,
    page: Number(meta.current_page ?? 1),
    pageCount: Number(meta.last_page ?? 1),
    total: Number(meta.total ?? list.length),
  };
}

export default function AccWarehouseStock() {
  const t = useTranslations();
  const { formatNumber } = useLocale();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);

  const [rows, setRows] = useState<StockRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/v1/erp-accounting/warehouses').then((res) => {
      setWarehouses(normalizeListPayload(res.data) as unknown as Warehouse[]);
    }).catch(() => {});
  }, []);

  const loadStock = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean> = { per_page: 50, page: p };
      if (filterWarehouse !== 'all') params.warehouse_id = filterWarehouse;
      if (lowOnly) params.low_only = 1;
      const res = await apiClient.get('/v1/erp-accounting/warehouse-stock', { params });
      const paged = parsePaginated<StockRow>(res.data);
      setRows(paged.data);
      setPage(paged.page);
      setPageCount(paged.pageCount);
      setTotal(paged.total);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterWarehouse, lowOnly]);

  useEffect(() => { void loadStock(1); }, [loadStock]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('auto.accounting_AccWarehouseStock.s_a747e3f6')}</h2>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('auto.accounting_AccWarehouseStock.s_3aeb36b5')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auto.accounting_AccWarehouseStock.s_0a7f24b0')}</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={lowOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLowOnly((v) => !v)}>
        
          {t('auto.accounting_AccWarehouseStock.s_b6f68808')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccWarehouseStock.s_51617f69')}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseStock.s_b764bbd3')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseStock.s_3aeb36b5')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseStock.s_55645b2c')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseStock.s_e8a43611')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isLow = Number(row.quantity) < Number(row.reorder_point);
              return (
                <tr
                  key={row.id ?? i}
                  className={cn(
                    'border-b border-border/60',
                    isLow && 'bg-destructive/10 text-destructive',
                  )}
                >
                  <td className="px-3 py-1.5">{row.product?.name ?? '—'}</td>
                  <td className="px-3 py-1.5">{row.warehouse?.name ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">{formatNumber(Number(row.quantity))}</td>
                  <td className="px-3 py-1.5 tabular-nums">{formatNumber(Number(row.reorder_point))}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  {t('auto.accounting_AccWarehouseStock.s_9d6557ea')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={(p) => void loadStock(p)} />
    </div>
  );
}
