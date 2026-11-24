'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { normalizeListPayload } from '@/lib/list-utils';
import { getAxiosMessage, unwrapData } from '@/features/modules/accounting/lib/api-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

type Warehouse = {
  id: number;
  name: string;
  address: string;
  is_default: boolean;
  is_active: boolean;
};

const BLANK = { name: '', address: '', is_default: false, is_active: true };

async function warehouseAction<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await apiClient.post(`/v1/erp-accounting/warehouse-ajax/${encodeURIComponent(action)}`, body);
  return unwrapData<T>(res);
}

export default function AccWarehouses() {
  const t = useTranslations();

  const [rows, setRows] = useState<Warehouse[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const fetchRows = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: p, per_page: 25 };
      if (query) params.q = query;
      const res = await apiClient.get('/v1/erp-accounting/warehouses', { params });
      const raw = res.data as Record<string, unknown>;
      const pg = (raw.current_page != null ? raw : (raw.data as Record<string, unknown>) ?? raw);
      setRows(normalizeListPayload(pg) as unknown as Warehouse[]);
      setPageCount(Number(pg.last_page) || 1);
      setTotal(Number(pg.total) || 0);
      setPage(Number(pg.current_page) || p);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void fetchRows(1); }, [fetchRows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Warehouse) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      address: row.address ?? '',
      is_default: Boolean(row.is_default),
      is_active: Boolean(row.is_active),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing?.id) {
        await warehouseAction('warehouses_update', { id: editing.id, ...form });
      } else {
        await warehouseAction('warehouses_create', { ...form });
      }
      setFormOpen(false);
      void fetchRows(page);
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  }, [editing, form, page, fetchRows]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await warehouseAction('warehouses_delete', { id: deleteTarget.id });
      setDeleteTarget(null);
      void fetchRows(page);
    } catch (e) {
      setError(getAxiosMessage(e));
      setDeleteTarget(null);
    }
  }, [deleteTarget, page, fetchRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder={t('auto.accounting_AccWarehouses.s_3beb4177')}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setQuery(searchInput)}
        />
        <Button variant="outline" size="sm" onClick={() => setQuery(searchInput)}>{t('auto.accounting_AccWarehouses.s_1fc039e0')}</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>{t('auto.accounting_AccWarehouses.s_e34fff4e')}</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccWarehouses.s_51617f69')}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_acc84041')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_45dd06ba')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_10fa5ce9')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_523e2d7c')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_6f637966')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccWarehouses.s_8d1cc546')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2">{row.id}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{row.address}</td>
                <td className="px-3 py-2">
                  <Badge variant={row.is_default ? 'default' : 'outline'}>{row.is_default ? t('auto.accounting_AccWarehouses.s_afcb410b') : t('auto.accounting_AccWarehouses.s_a7b8355e')}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={row.is_active ? 'default' : 'outline'}>{row.is_active ? t('auto.accounting_AccWarehouses.s_afcb410b') : t('auto.accounting_AccWarehouses.s_a7b8355e')}</Badge>
                </td>
                <td className="px-3 py-2 gap-x-1 rtl:gap-x-reverse">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>{t('auto.accounting_AccWarehouses.s_ac60ae7a')}</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(row)}>{t('auto.accounting_AccWarehouses.s_2d2bbdc2')}</Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">{t('auto.accounting_AccWarehouses.s_35e7797d')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} total={total} onPageChange={p => fetchRows(p)} />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('auto.accounting_AccWarehouses.s_dcd4250e') : t('auto.accounting_AccWarehouses.s_05a2722d')}</DialogTitle>
            <DialogDescription>{editing ? t('auto.accounting_AccWarehouses.s_d6940bf9') : t('auto.accounting_AccWarehouses.s_d02323ba')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccWarehouses.s_45dd06ba')}</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccWarehouses.s_10fa5ce9')}</label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="h-4 w-4 rounded border-input" />
                {t('auto.accounting_AccWarehouses.s_523e2d7c')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-input" />
                {t('auto.accounting_AccWarehouses.s_6f637966')}
              </label>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('auto.accounting_AccWarehouses.s_106dfb4e')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('auto.accounting_AccWarehouses.s_4b7554d6') : t('auto.accounting_AccWarehouses.s_08545fb6')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccWarehouses.s_c97ff919')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDeleteNamed', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.accounting_AccWarehouses.s_106dfb4e')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('auto.accounting_AccWarehouses.s_2d2bbdc2')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
