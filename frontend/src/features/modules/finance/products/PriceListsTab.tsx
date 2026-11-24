'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

type PriceList = { id: number; name: string; is_active?: boolean };
type Product = { id: number; name: string };
type PriceListItem = { product_id: number; price: number };

export function PriceListsTab() {
  const t = useTranslations();
  const tp = useTranslations('finance.products');
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [itemPrices, setItemPrices] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listData, prodData] = await Promise.all([
        accountingWpAction<{ items?: PriceList[] } | PriceList[]>('price_lists'),
        accountingWpAction<{ items?: Product[] } | Product[]>('products_list'),
      ]);
      const listItems = Array.isArray(listData) ? listData : (listData?.items ?? []);
      const prodItems = Array.isArray(prodData) ? prodData : (prodData?.items ?? []);
      setLists(listItems as PriceList[]);
      setProducts(prodItems as Product[]);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setDialogOpen(true);
  };

  const openEdit = (pl: PriceList) => {
    setEditingId(pl.id);
    setFormName(pl.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await accountingWpAction('price_list_save', {
        id: editingId ?? undefined,
        name: formName.trim(),
        is_active: true,
      });
      setDialogOpen(false);
      await load();
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const openItems = async (id: number) => {
    setActiveListId(id);
    setError(null);
    try {
      const data = await accountingWpAction<{
        price_list?: { items?: PriceListItem[] };
        items?: PriceListItem[];
      }>('price_list_get', { id });
      const rows = data?.price_list?.items ?? data?.items ?? [];
      const prices: Record<number, string> = {};
      for (const row of rows) {
        prices[row.product_id] = String(row.price);
      }
      setItemPrices(prices);
      setItemsDialogOpen(true);
    } catch (e) {
      setError(getAxiosMessage(e));
    }
  };

  const saveItems = async () => {
    if (activeListId == null) return;
    setSaving(true);
    setError(null);
    try {
      const items = products
        .map((p) => ({
          product_id: p.id,
          price: parseFloat(itemPrices[p.id] ?? '') || 0,
        }))
        .filter((row) => row.price > 0);
      await accountingWpAction('price_list_items_save', {
        price_list_id: activeListId,
        items,
      });
      setItemsDialogOpen(false);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await accountingWpAction('price_list_delete', { id: deleteId });
      setDeleteId(null);
      await load();
    } catch (e) {
      setError(getAxiosMessage(e));
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="ms-1 h-4 w-4" />
          {tp('priceListNew')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-start font-medium">{tp('name')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-medium">{row.name}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void openItems(row.id)}>
                        {tp('editPrices')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(row.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {lists.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">{t('common.noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? tp('priceListEdit') : tp('priceListNew')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">{tp('name')}</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving || !formName.trim()}>
              {saving ? tp('saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemsDialogOpen} onOpenChange={setItemsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tp('editPrices')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{p.name}</span>
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  value={itemPrices[p.id] ?? ''}
                  onChange={(e) => setItemPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              </div>
            ))}
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void saveItems()} disabled={saving}>
              {saving ? tp('saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
