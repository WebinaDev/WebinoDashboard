<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\User;
use App\Models\WalletLedger;
use App\Services\Reports\OrderReports;
use App\Services\Wallet\WalletService;
use Illuminate\Validation\ValidationException;

final class WalletCheckout
{
    public function __construct(private readonly WalletService $wallets) {}

    public function isWalletOrder(Order $order): bool
    {
        return (string) ($order->payment_tender ?? '') === 'wallet'
            || (string) ($order->payment_provider ?? '') === 'wallet';
    }

    public function sync(Order $order, ?string $from, string $to): void
    {
        if (! $this->isWalletOrder($order)) {
            return;
        }
        $sales = OrderReports::salesStatuses();
        $was = $from !== null && in_array($from, $sales, true);
        $now = in_array($to, $sales, true);
        if ($now && ! $was) {
            $this->debit($order);
        }
        if ($was && ! $now && in_array($to, ['cancelled', 'failed', 'payment_failed', 'refunded'], true)) {
            $this->restoreRemainder($order, 'order_cancel');
        }
    }

    public function debit(Order $order): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        if ((int) ($meta['wallet_debited_minor'] ?? 0) > 0) {
            return;
        }
        $amount = (int) $order->total_minor;
        if ($amount < 1) {
            $meta['wallet_debited_minor'] = 0;
            $order->meta = $meta;
            $order->saveQuietly();

            return;
        }
        $user = $this->customer($order);
        $this->wallets->adjust(
            $user,
            (int) $order->tenant_id,
            'debit',
            $amount,
            'checkout',
            'Order '.($order->number ?: $order->id),
            'order',
            (int) $order->id
        );
        $meta['wallet_debited_minor'] = $amount;
        $order->meta = $meta;
        $order->amount_paid_minor = $amount;
        $order->payment_tender = 'wallet';
        $order->payment_provider = 'wallet';
        $order->saveQuietly();
    }

    public function creditRefund(Order $order, int $amount, int $returnId): void
    {
        if ($amount < 1 || ! $this->isWalletOrder($order)) {
            return;
        }
        $exists = WalletLedger::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('ref_type', 'order_return')
            ->where('ref_id', $returnId)
            ->where('direction', 'credit')
            ->exists();
        if ($exists) {
            return;
        }
        $meta = is_array($order->meta) ? $order->meta : [];
        $debited = (int) ($meta['wallet_debited_minor'] ?? 0);
        $already = (int) ($meta['wallet_refunded_minor'] ?? 0);
        $room = max(0, $debited - $already);
        $credit = $room > 0 ? min($amount, $room) : $amount;
        if ($credit < 1) {
            return;
        }
        $user = $this->customer($order);
        $this->wallets->adjust(
            $user,
            (int) $order->tenant_id,
            'credit',
            $credit,
            'order_refund',
            'Refund for order return #'.$returnId,
            'order_return',
            $returnId
        );
        $meta['wallet_refunded_minor'] = $already + $credit;
        $order->meta = $meta;
        $order->saveQuietly();
    }

    public function restoreRemainder(Order $order, string $reason): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $debited = (int) ($meta['wallet_debited_minor'] ?? 0);
        $already = (int) ($meta['wallet_refunded_minor'] ?? 0);
        $credit = $debited - $already;
        if ($credit < 1 || ! $order->user_id) {
            return;
        }
        $user = User::query()->whereKey($order->user_id)->first();
        if (! $user) {
            return;
        }
        $this->wallets->adjust(
            $user,
            (int) $order->tenant_id,
            'credit',
            $credit,
            $reason,
            'Wallet restore for order '.($order->number ?: $order->id),
            'order',
            (int) $order->id
        );
        $meta['wallet_refunded_minor'] = $already + $credit;
        $order->meta = $meta;
        $order->saveQuietly();
    }

    private function customer(Order $order): User
    {
        $user = $order->user_id ? User::query()->whereKey($order->user_id)->first() : null;
        if (! $user) {
            throw ValidationException::withMessages(['payment_method' => 'Wallet payment requires a customer account.']);
        }

        return $user;
    }
}
