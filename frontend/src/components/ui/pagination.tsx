'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from '@/hooks/use-locale';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type PaginationProps = {
  page: number;
  pageCount: number;
  total?: number;
  onPageChange: (p: number) => void;
  className?: string;
};

export function Pagination({ page, pageCount, total, onPageChange, className }: PaginationProps) {
  const t = useTranslations();
  const { formatNumber } = useLocale();
  const pageLabel = formatNumber(page);
  const pageCountLabel = formatNumber(pageCount);
  const totalLabel = total != null ? formatNumber(total) : '';

  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 text-sm', className)}>
      <p className="text-muted-foreground">
        {total != null ? (
          <>
            {t('common.pageOfItems', { page: pageLabel, pageCount: pageCountLabel, total: totalLabel })}
          </>
        ) : (
          <>
            {t('common.pageSlash', { page: pageLabel, pageCount: pageCountLabel })}
          </>
        )}
      </p>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="sm" disabled={!canPrev} onClick={() => onPageChange(page - 1)} aria-label={t('auto.pagination.s_1a592f6b')}>
          <ChevronRight className="rtl:rotate-180 h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label={t('auto.pagination.s_54ee927e')}>
          <ChevronLeft className="rtl:rotate-180 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
