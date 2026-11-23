<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Services\Accounting\AccountingIntegrationsRegistry;
use App\Services\Accounting\MoadianService;
use App\Services\Accounting\OrderAccountingSync;
use App\Services\Coupons\CouponService;
use Illuminate\Support\Facades\Log;

/**
 * Stock, coupon consumption, wallet debit, and accounting sync follow the same status edge.
 */
final class OrderLifecycle
{
    public function __construct(
        private readonly OrderStock $stock,
        private readonly CouponService $coupons,
        private readonly WalletCheckout $wallet,
        private readonly OrderAccountingSync $accounting,
        private readonly MoadianService $moadian,
        private readonly AccountingIntegrationsRegistry $integrations,
    ) {}

    public function sync(Order $order, ?string $from): void
    {
        $to = (string) $order->status;
        $this->stock->sync($order, $from, $to);
        $order->refresh();
        // Branch stock moves on the same edge as tenant stock, but it is allowed to go
        // negative (an offline sale has already taken the money). Nothing here may throw.
        $this->syncBranchStock($order, $from, $to);
        $order->refresh();
        $this->coupons->syncOrder($order, $from, $to);
        $order->refresh();
        $this->wallet->sync($order, $from, $to);
        $order->refresh();
        app(\App\Services\GiftCards\GiftCardService::class)->syncOrder($order, $from, $to);
        $order->refresh();
        $this->syncAccounting($order, $from);
        app(\App\Services\Membership\MembershipService::class)->syncOrder($order, $from, $to);
    }

    /**
     * Mirror the tenant-wide stock edge onto the order's branch.
     *
     * Deliberately tolerant: a failure here must never block a sale that already took
     * money, and a negative result is recorded rather than raised.
     */
    private function syncBranchStock(Order $order, ?string $from, string $to): void
    {
        if ($order->branch_id === null) {
            return;
        }

        $sales = \App\Services\Reports\OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);

        if ($was === $now) {
            return;
        }

        try {
            // Going into a sale removes stock; coming back out returns it.
            app(\App\Services\Orders\BranchStockService::class)
                ->applyOrder($order, $now ? -1 : 1);
        } catch (\Throwable $e) {
            Log::warning('branch stock sync failed', [
                'order_id' => $order->id,
                'branch_id' => $order->branch_id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function syncAccounting(Order $order, ?string $from): void
    {
        try {
            // A refund needs a reversing journal, not a new sale. It also has to run when the
            // order reaches `refunded`, which is deliberately absent from SYNC_STATUSES so a
            // refund never posts a second sale invoice.
            if ($this->accounting->refundedMinor($order) > 0) {
                $credit = $this->accounting->syncRefund($order);
                if ($credit) {
                    $this->maybePushHesabfa((int) $order->tenant_id, $credit->id);
                }
            }

            $invoice = $this->accounting->syncIfNeeded($order, $from);
            if (! $invoice) {
                return;
            }
            $cfg = $this->moadian->rawSettings((int) $order->tenant_id);
            if (! empty($cfg['enabled']) && ! empty($cfg['auto_send_on_sync']) && ! in_array($invoice->moadian_status, ['accepted', 'queued', 'sent'], true)) {
                $job = $this->moadian->enqueue($invoice, 'send');
                $this->moadian->processJob($job);
            }
            $this->maybePushHesabfa((int) $order->tenant_id, $invoice->id);
        } catch (\Throwable $e) {
            Log::warning('accounting.order_sync_failed', [
                'order_id' => $order->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    private function maybePushHesabfa(int $tenantId, int $invoiceId): void
    {
        try {
            $settings = $this->integrations->getSettings($tenantId, 'hesabfa');
            $auto = array_key_exists('auto_sync_orders', $settings)
                ? (bool) $settings['auto_sync_orders']
                : true;
            if (empty($settings['enabled']) || ! $auto || empty($settings['has_api_key'])) {
                return;
            }

            $invoice = \App\Models\AccInvoice::query()
                ->where('tenant_id', $tenantId)
                ->with('lines')
                ->find($invoiceId);
            if (! $invoice) {
                return;
            }
            $meta = is_array($invoice->meta) ? $invoice->meta : [];
            if (! empty($meta['integrations']['hesabfa']['remote_id'])) {
                return;
            }

            $payload = [
                'Number' => $invoice->number,
                'DateTime' => $invoice->issue_date?->toDateString(),
                'InvoiceType' => 0,
                'Status' => 1,
                'ContactCode' => $invoice->person_id,
                'InvoiceItems' => $invoice->lines->map(fn ($l) => [
                    'Description' => $l->description,
                    'Quantity' => $l->qty,
                    'UnitPrice' => $l->unit_price_minor,
                    'Discount' => $l->discount_minor,
                    'Tax' => $l->tax_minor,
                ])->all(),
            ];
            $res = $this->integrations->pushInvoice($tenantId, 'hesabfa', $payload);
            if ($res['ok'] ?? false) {
                $meta['integrations']['hesabfa'] = [
                    'remote_id' => $res['remote_id'] ?? null,
                    'pushed_at' => now()->toIso8601String(),
                ];
                $invoice->update(['meta' => $meta]);
            }
        } catch (\Throwable $e) {
            Log::warning('accounting.hesabfa_push_failed', [
                'invoice_id' => $invoiceId,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
