'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { normalizeListPayload } from '@/lib/list-utils';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { FolderTree, Ruler } from 'lucide-react';
import { PriceListsTab } from '@/features/modules/finance/products/PriceListsTab';
import { UnitsManagerDialog } from '@/features/modules/finance/products/UnitsManagerDialog';
import { CategoryManagerSheet } from '@/features/modules/finance/products/CategoryManagerSheet';
import { useLocale } from '@/hooks/use-locale-next';

type Product = {
  id: number;
  name: string;
  barcode: string;
  buy_price: number;
  sell_price: number;
  unit_id: number | null;
  category_id: number | null;
  inventory_controlled: boolean;
};

type OptionItem = { id: number; name: string };

const BLANK = {
  name: '',
  unit_id: '',
  barcode: '',
  category_id: '',
  buy_price: '',
  sell_price: '',
  inventory_controlled: false,
};

export default function AccProducts() {
  const t = useTranslations();
  const tp = useTranslations('finance.products');
  const { formatNumber } = useLocale();

  const [rows, setRows] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const [units, setUnits] = useState<OptionItem[]>([]);
  const [categories, setCategories] = useState<OptionItem[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [unitsData, catsData] = await Promise.all([
        accountingWpAction<{ items?: OptionItem[] } | OptionItem[]>('units_list'),
        accountingWpAction<{ items?: OptionItem[] } | OptionItem[]>('product_categories'),
      ]);
      const u = Array.isArray(unitsData) ? unitsData : (unitsData?.items ?? []);
      const c = Array.isArray(catsData) ? catsData : (catsData?.items ?? []);
      setUnits(u as OptionItem[]);
      setCategories(c as OptionItem[]);
    } catch {
      /* ignore option load errors */
    }
  }, []);

  const fetchRows = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: p, per_page: 25 };
      if (query) params.q = query;
      const res = await apiClient.get('/v1/erp-accounting/products', { params });
      const raw = res.data as Record<string, unknown>;
      const pg = (raw.current_page != null ? raw : (raw.data as Record<string, unknown>) ?? raw);
      setRows(normalizeListPayload(pg) as unknown as Product[]);
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

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Product) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      unit_id: row.unit_id ? String(row.unit_id) : '',
      barcode: row.barcode ?? '',
      category_id: row.category_id ? String(row.category_id) : '',
      buy_price: row.buy_price != null ? String(row.buy_price) : '',
      sell_price: row.sell_price != null ? String(row.sell_price) : '',
      inventory_controlled: Boolean(row.inventory_controlled),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        barcode: form.barcode,
        category_id: form.category_id ? Number(form.category_id) : null,
        buy_price: form.buy_price ? Number(form.buy_price) : 0,
        sell_price: form.sell_price ? Number(form.sell_price) : 0,
        inventory_controlled: form.inventory_controlled,
      };
      if (editing?.id) body.id = editing.id;
      await accountingWpAction('product_save', body);
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
      await accountingWpAction('product_delete', { id: deleteTarget.id });
      setDeleteTarget(null);
      void fetchRows(page);
    } catch (e) {
      setError(getAxiosMessage(e));
      setDeleteTarget(null);
    }
  }, [deleteTarget, page, fetchRows]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">{tp('tabList')}</TabsTrigger>
          <TabsTrigger value="price-lists">{tp('tabPriceLists')}</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategorySheetOpen(true)} className="gap-2">
            <FolderTree className="h-4 w-4" />
            {tp('tabCategories')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUnitsOpen(true)} className="gap-2">
            <Ruler className="h-4 w-4" />
            {tp('tabUnits')}
          </Button>
        </div>

        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder={t('auto.accounting_AccProducts.s_f1b2b906')}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setQuery(searchInput)}
            />
            <Button variant="outline" size="sm" onClick={() => setQuery(searchInput)}>{t('auto.accounting_AccProducts.s_1fc039e0')}</Button>
            <div className="flex-1" />
            <Button size="sm" onClick={openCreate}>{t('auto.accounting_AccProducts.s_e34fff4e')}</Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccProducts.s_51617f69')}</p>}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_acc84041')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_45dd06ba')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_60b7dd5f')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_299e3b7b')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_d8daa96f')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccProducts.s_8d1cc546')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b">
                    <td className="px-3 py-2">{row.id}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.barcode}</td>
                    <td className="px-3 py-2">{formatNumber(Number(row.buy_price))}</td>
                    <td className="px-3 py-2">{formatNumber(Number(row.sell_price))}</td>
                    <td className="px-3 py-2 gap-x-1 rtl:gap-x-reverse">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>{t('auto.accounting_AccProducts.s_ac60ae7a')}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(row)}>{t('auto.accounting_AccProducts.s_2d2bbdc2')}</Button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">{t('auto.accounting_AccProducts.s_35e7797d')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <Pagination page={page} pageCount={pageCount} total={total} onPageChange={p => fetchRows(p)} />
          )}
        </TabsContent>

        <TabsContent value="price-lists">
          <PriceListsTab />
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('auto.accounting_AccProducts.s_0bc110e9') : t('auto.accounting_AccProducts.s_3e1b42a7')}</DialogTitle>
            <DialogDescription>{editing ? t('auto.accounting_AccProducts.s_669b9961') : t('auto.accounting_AccProducts.s_16a87097')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_45dd06ba')}</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_91bd5660')}</label>
              <Select value={form.unit_id || undefined} onValueChange={v => setForm({ ...form, unit_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('auto.accounting_AccProducts.s_5e139c5b')} /></SelectTrigger>
                <SelectContent>
                  {units.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_60b7dd5f')}</label>
              <Input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_a4dfaeb7')}</label>
              <Select value={form.category_id || undefined} onValueChange={v => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('auto.accounting_AccProducts.s_315c72ae')} /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_299e3b7b')}</label>
                <Input type="number" value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccProducts.s_d8daa96f')}</label>
                <Input type="number" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.inventory_controlled}
                onChange={e => setForm({ ...form, inventory_controlled: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              /> {t('auto.accounting_AccProducts.s_490ffd8e')}
            </label>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('auto.accounting_AccProducts.s_106dfb4e')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('auto.accounting_AccProducts.s_4b7554d6') : t('auto.accounting_AccProducts.s_08545fb6')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccProducts.s_e9a9c15e')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDeleteNamed', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.accounting_AccProducts.s_106dfb4e')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('auto.accounting_AccProducts.s_2d2bbdc2')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategoryManagerSheet
        open={categorySheetOpen}
        onOpenChange={setCategorySheetOpen}
        onChanged={() => void loadOptions()}
      />
      <UnitsManagerDialog
        open={unitsOpen}
        onOpenChange={setUnitsOpen}
        onChanged={() => void loadOptions()}
      />
    </div>
  );
}
