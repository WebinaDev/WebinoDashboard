'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from '@/hooks/use-locale-next';

import { Fragment, useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/ui/pagination';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

type Warehouse = { id: number; name: string };

type DocItem = { product_id: string; quantity: string; unit_price: string };

type WarehouseDoc = {
  id: number;
  warehouse?: { name?: string };
  warehouse_id?: number;
  notes?: string;
  status: string;
  created_at?: string;
  items?: Record<string, unknown>[];
};

const EMPTY_DOC_ITEM: DocItem = { product_id: '', quantity: '1', unit_price: '0' };

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

export default function AccWarehouseInbound() {
  const t = useTranslations();
  const { formatDateTime } = useLocale();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'posted'>('all');
  const [filterWarehouseId, setFilterWarehouseId] = useState('all');
  const [rows, setRows] = useState<WarehouseDoc[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<DocItem[]>([{ ...EMPTY_DOC_ITEM }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/v1/erp-accounting/warehouses').then((res) => {
      setWarehouses(normalizeListPayload(res.data) as unknown as Warehouse[]);
    }).catch(() => {});
  }, []);

  const loadDocs = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { per_page: 25, page: p };
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterWarehouseId !== 'all') params.warehouse_id = filterWarehouseId;
      const res = await apiClient.get('/v1/erp-accounting/warehouse-inbound', { params });
      const paged = parsePaginated<WarehouseDoc>(res.data);
      setRows(paged.data);
      setPage(paged.page);
      setPageCount(paged.pageCount);
      setTotal(paged.total);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterWarehouseId]);

  useEffect(() => { void loadDocs(1); }, [loadDocs]);

  const openCreate = useCallback(() => {
    setFormWarehouseId(warehouses[0]?.id ? String(warehouses[0].id) : '');
    setFormNotes('');
    setFormItems([{ ...EMPTY_DOC_ITEM }]);
    setDialogOpen(true);
  }, [warehouses]);

  const updateItem = useCallback((idx: number, field: keyof DocItem, value: string) => {
    setFormItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }, []);

  const addItem = useCallback(() => {
    setFormItems((prev) => [...prev, { ...EMPTY_DOC_ITEM }]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setFormItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.post('/v1/erp-accounting/warehouse-ajax/warehouse_document_create', {
        warehouse_id: Number(formWarehouseId),
        type: 'inbound',
        items: formItems.map((it) => ({
          product_id: Number(it.product_id) || 0,
          quantity: parseFloat(it.quantity) || 0,
          unit_price: parseFloat(it.unit_price) || 0,
        })),
        notes: formNotes,
        status: 'draft',
      });
      setDialogOpen(false);
      void loadDocs(page);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  }, [formWarehouseId, formItems, formNotes, loadDocs, page]);

  const handlePost = useCallback(async (id: number) => {
    try {
      await apiClient.post('/v1/erp-accounting/warehouse-ajax/warehouse_document_post', { id });
      void loadDocs(page);
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  }, [loadDocs, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccWarehouseInbound.s_b266288a')}</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="ms-1 h-4 w-4" /> {t('auto.accounting_AccWarehouseInbound.s_6e20659f')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as 'all' | 'draft' | 'posted')}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('auto.accounting_AccWarehouseInbound.s_55518965')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auto.accounting_AccWarehouseInbound.s_7552ab35')}</SelectItem>
            <SelectItem value="draft">{t('auto.accounting_AccWarehouseInbound.s_7d739ea1')}</SelectItem>
            <SelectItem value="posted">{t('auto.accounting_AccWarehouseInbound.s_1223f269')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterWarehouseId} onValueChange={setFilterWarehouseId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t('auto.accounting_AccWarehouseInbound.s_3aeb36b5')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auto.accounting_AccWarehouseInbound.s_0a7f24b0')}</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_51617f69')}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_acc84041')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_3aeb36b5')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_2c09d41c')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_55518965')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_6a67beb8')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_8d1cc546')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((doc) => (
              <Fragment key={doc.id}>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-1.5">{doc.id}</td>
                  <td className="px-3 py-1.5">{doc.warehouse?.name ?? '—'}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate">{doc.notes ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={doc.status === 'posted' ? 'default' : 'secondary'}>
                      {doc.status === 'posted' ? t('auto.accounting_AccWarehouseInbound.s_1223f269') : t('auto.accounting_AccWarehouseInbound.s_7d739ea1')}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">{doc.created_at ? formatDateTime(String(doc.created_at)) : '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      {doc.status === 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => void handlePost(doc.id)}>
                          {t('auto.accounting_AccWarehouseInbound.s_0c801ba8')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                      >
                        {expandedId === doc.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedId === doc.id && (
                  <tr className="border-b border-border/60 bg-muted/20">
                    <td colSpan={6} className="px-6 py-3">
                      {doc.items && doc.items.length > 0 ? (
                        <>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_16d8617a')}</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr>
                                <th className="px-2 py-1 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_9865e1d5')}</th>
                                <th className="px-2 py-1 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_687f8df3')}</th>
                                <th className="px-2 py-1 text-start font-medium">{t('auto.accounting_AccWarehouseInbound.s_3709c4a6')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {doc.items.map((it, i) => (
                                <tr key={i}>
                                  <td className="px-2 py-0.5">{String(it.product_id ?? '—')}</td>
                                  <td className="px-2 py-0.5">{String(it.quantity ?? '—')}</td>
                                  <td className="px-2 py-0.5">{String(it.unit_price ?? '—')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_8b121c6a')}</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  {t('auto.accounting_AccWarehouseInbound.s_a8a405d5')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} total={total} onPageChange={(p) => void loadDocs(p)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('auto.accounting_AccWarehouseInbound.s_50530cae')}</DialogTitle>
            <DialogDescription>{t('auto.accounting_AccWarehouseInbound.s_920b0040')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('auto.accounting_AccWarehouseInbound.s_3aeb36b5')}</label>
              <Select value={formWarehouseId} onValueChange={setFormWarehouseId}>
                <SelectTrigger><SelectValue placeholder={t('auto.accounting_AccWarehouseInbound.s_d3c3902f')} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t('auto.accounting_AccWarehouseInbound.s_101ca9b8')}</label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="ms-1 h-3.5 w-3.5" /> {t('auto.accounting_AccWarehouseInbound.s_ffd73187')}
                </Button>
              </div>
              {formItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 rounded-md border p-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_9865e1d5')}</label>
                    <Input value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)} />
                  </div>
                  <div className="w-24 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_687f8df3')}</label>
                    <Input value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
                  </div>
                  <div className="w-28 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('auto.accounting_AccWarehouseInbound.s_3709c4a6')}</label>
                    <Input value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} />
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeItem(idx)} disabled={formItems.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('auto.accounting_AccWarehouseInbound.s_2c09d41c')}</label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? t('auto.accounting_AccWarehouseInbound.s_4b7554d6') : t('auto.accounting_AccWarehouseInbound.s_f14ef897')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
