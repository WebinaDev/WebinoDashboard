'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { normalizeListPayload } from '@/lib/list-utils';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { LocaleDatePicker } from '@/components/ui/locale-date-picker';
import { useLocale } from '@/hooks/use-locale-next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Receipt = {
  id: number;
  type: string;
  number: string;
  date: string;
  amount: number;
  person_id: number | null;
  cash_account_id: number | null;
  description: string;
  status: string;
};

const BLANK = {
  type: 'receipt',
  number: '',
  date: '',
  amount: '',
  person_id: '',
  cash_account_id: '',
  description: '',
  status: 'draft',
};

export default function AccReceipts() {
  const t = useTranslations();
  const { formatNumber, formatDate } = useLocale();

  const [rows, setRows] = useState<Receipt[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const [deleteTarget, setDeleteTarget] = useState<Receipt | null>(null);

  const fetchRows = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: p, per_page: 25 };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await apiClient.get('/v1/erp-accounting/receipts', { params });
      const raw = res.data as Record<string, unknown>;
      const pg = (raw.current_page != null ? raw : (raw.data as Record<string, unknown>) ?? raw);
      setRows(normalizeListPayload(pg) as unknown as Receipt[]);
      setPageCount(Number(pg.last_page) || 1);
      setTotal(Number(pg.total) || 0);
      setPage(Number(pg.current_page) || p);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => { void fetchRows(1); }, [fetchRows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Receipt) => {
    setEditing(row);
    setForm({
      type: row.type ?? 'receipt',
      number: row.number ?? '',
      date: row.date ?? '',
      amount: row.amount != null ? String(row.amount) : '',
      person_id: row.person_id != null ? String(row.person_id) : '',
      cash_account_id: row.cash_account_id != null ? String(row.cash_account_id) : '',
      description: row.description ?? '',
      status: row.status ?? 'draft',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        number: form.number,
        date: form.date,
        amount: form.amount ? Number(form.amount) : 0,
        person_id: form.person_id ? Number(form.person_id) : null,
        cash_account_id: form.cash_account_id ? Number(form.cash_account_id) : null,
        description: form.description,
        status: form.status,
      };
      if (editing?.id) body.id = editing.id;
      await accountingWpAction('receipt_save', body);
      setFormOpen(false);
      void fetchRows(page);
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  }, [editing, form, page, fetchRows]);

  const postReceipt = useCallback(async (id: number) => {
    try {
      await accountingWpAction('receipt_post', { id });
      void fetchRows(page);
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  }, [page, fetchRows]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await accountingWpAction('receipt_delete', { id: deleteTarget.id });
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
        <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('auto.accounting_AccReceipts.s_d2e35a1f')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auto.accounting_AccReceipts.s_9e3d846e')}</SelectItem>
            <SelectItem value="receipt">{t('auto.accounting_AccReceipts.s_6afda7e1')}</SelectItem>
            <SelectItem value="payment">{t('auto.accounting_AccReceipts.s_29444d5c')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus || 'all'} onValueChange={v => setFilterStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('auto.accounting_AccReceipts.s_55518965')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auto.accounting_AccReceipts.s_7552ab35')}</SelectItem>
            <SelectItem value="draft">{t('auto.accounting_AccReceipts.s_7d739ea1')}</SelectItem>
            <SelectItem value="posted">{t('auto.accounting_AccReceipts.s_1223f269')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>{t('auto.accounting_AccReceipts.s_e34fff4e')}</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccReceipts.s_51617f69')}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_acc84041')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_987584a3')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_217c8491')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_d2e35a1f')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_f5668e5b')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_55518965')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccReceipts.s_8d1cc546')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2">{row.id}</td>
                <td className="px-3 py-2">{row.number}</td>
                <td className="px-3 py-2">{formatDate(String(row.date)) || row.date}</td>
                <td className="px-3 py-2">{row.type === 'payment' ? t('auto.accounting_AccReceipts.s_29444d5c') : t('auto.accounting_AccReceipts.s_6afda7e1')}</td>
                <td className="px-3 py-2">{formatNumber(Number(row.amount))}</td>
                <td className="px-3 py-2">
                  <Badge variant={row.status === 'posted' ? 'default' : 'outline'}>
                    {row.status === 'posted' ? t('auto.accounting_AccReceipts.s_1223f269') : t('auto.accounting_AccReceipts.s_7d739ea1')}
                  </Badge>
                </td>
                <td className="px-3 py-2 gap-x-1 rtl:gap-x-reverse">
                  {row.status === 'draft' && (
                    <Button variant="outline" size="sm" onClick={() => postReceipt(row.id)}>{t('auto.accounting_AccReceipts.s_28fa93e8')}</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>{t('auto.accounting_AccReceipts.s_ac60ae7a')}</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(row)}>{t('auto.accounting_AccReceipts.s_2d2bbdc2')}</Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">{t('auto.accounting_AccReceipts.s_35e7797d')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} total={total} onPageChange={p => fetchRows(p)} />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('auto.accounting_AccReceipts.s_76bb9e81') : t('auto.accounting_AccReceipts.s_efdad094')}</DialogTitle>
            <DialogDescription>{editing ? t('auto.accounting_AccReceipts.s_2eb8486e') : t('auto.accounting_AccReceipts.s_3e098575')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_d2e35a1f')}</label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">{t('auto.accounting_AccReceipts.s_6afda7e1')}</SelectItem>
                  <SelectItem value="payment">{t('auto.accounting_AccReceipts.s_29444d5c')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_987584a3')}</label>
              <Input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_217c8491')}</label>
              <LocaleDatePicker value={form.date || undefined} onChange={v => setForm({ ...form, date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_f5668e5b')}</label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_8c1d4b9c')}</label>
              <Input value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_e0f7e29a')}</label>
              <Input value={form.cash_account_id} onChange={e => setForm({ ...form, cash_account_id: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_55bbd4b9')}</label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccReceipts.s_55518965')}</label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('auto.accounting_AccReceipts.s_7d739ea1')}</SelectItem>
                  <SelectItem value="posted">{t('auto.accounting_AccReceipts.s_1223f269')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('auto.accounting_AccReceipts.s_106dfb4e')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('auto.accounting_AccReceipts.s_4b7554d6') : t('auto.accounting_AccReceipts.s_08545fb6')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccReceipts.s_aad2c499')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDeleteReceipt', { number: deleteTarget?.number ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.accounting_AccReceipts.s_106dfb4e')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('auto.accounting_AccReceipts.s_2d2bbdc2')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
