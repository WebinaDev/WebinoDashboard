'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';

type Category = { id: number; name: string; sort_order?: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
};

export function CategoryManagerSheet({ open, onOpenChange, onChanged }: Props) {
  const t = useTranslations();
  const tp = useTranslations('finance.products');
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountingWpAction<{ items?: Category[] } | Category[]>('product_categories');
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setItems(list as Category[]);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await accountingWpAction('product_category_save', { name: name.trim() });
      setName('');
      await load();
      onChanged?.();
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await accountingWpAction('product_category_delete', { id: deleteId });
      setDeleteId(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(getAxiosMessage(e));
      setDeleteId(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{tp('tabCategories')}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">{tp('name')}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button className="mt-6" onClick={() => void handleAdd()} disabled={saving || !name.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{c.name}</span>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="text-sm text-muted-foreground">{t('common.noData')}</li>
                )}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
    </>
  );
}
