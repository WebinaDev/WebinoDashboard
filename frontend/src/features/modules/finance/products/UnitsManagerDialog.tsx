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
import { Plus, Trash2 } from 'lucide-react';

type Unit = { id: number; name: string; symbol?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
};

export function UnitsManagerDialog({ open, onOpenChange, onChanged }: Props) {
  const t = useTranslations();
  const tp = useTranslations('finance.products');
  const [items, setItems] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountingWpAction<{ items?: Unit[] } | Unit[]>('units_list');
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setItems(list as Unit[]);
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
      await accountingWpAction('unit_save', { name: name.trim(), symbol: symbol || null });
      setName('');
      setSymbol('');
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
      await accountingWpAction('unit_delete', { id: deleteId });
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tp('tabUnits')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{tp('name')}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-sm font-medium">{tp('unitSymbol')}</label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </div>
            <Button onClick={() => void handleAdd()} disabled={saving || !name.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-start font-medium">{tp('name')}</th>
                    <th className="px-3 py-2 text-start font-medium">{tp('unitSymbol')}</th>
                    <th className="w-12 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="px-3 py-1.5">{u.name}</td>
                      <td className="px-3 py-1.5">{u.symbol ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(u.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{t('common.noData')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
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
    </>
  );
}
