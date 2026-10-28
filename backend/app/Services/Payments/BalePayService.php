<?php

namespace App\Services\Payments;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Bots\BotClient;
use App\Services\Orders\OrderStatusService;
use App\Services\Shop\LoyaltyService;

/**
 * Bale wallet invoices (port of WP telegram-bot PaymentHandler): the order is marked paid only after
 * Bale reports successful_payment and payload, amount and bound chat all match the pending intent.
 */
class BalePayService
{
    public const PAYABLE = ['pending_payment', 'awaiting_gateway', 'payment_failed'];

    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected OrderStatusService $statuses,
        protected LoyaltyService $loyalty,
    ) {}

    public static function sign(int $orderId): string
    {
        return $orderId.':'.substr(hash_hmac('sha256', 'bale_pay:'.$orderId, (string) config('app.key')), 0, 16);
    }

    public static function verifyPayload(string $payload): ?int
    {
        if (! preg_match('/^(\d+):([a-f0-9]{16})$/', $payload, $m)) {
            return null;
        }

        return hash_equals(self::sign((int) $m[1]), $payload) ? (int) $m[1] : null;
    }

    protected function intentFor(int $tenantId, int $orderId): ?PaymentIntent
    {
        return PaymentIntent::query()
            ->where('tenant_id', $tenantId)
            ->where('order_id', $orderId)
            ->where('provider', 'bale_pay')
            ->latest('id')
            ->first();
    }

    /** Resolve order + pending intent for a payload, or a Persian error. @return array{0:?Order,1:?PaymentIntent,2:?string} */
    protected function resolve(int $tenantId, string $payload): array
    {
        $orderId = self::verifyPayload($payload);
        $order = $orderId ? Order::query()->where('tenant_id', $tenantId)->find($orderId) : null;
        if (! $order) {
            return [null, null, 'سفارش نامعتبر است.'];
        }
        $intent = $this->intentFor($tenantId, $order->id);
        if (! $intent || ! in_array($order->status, self::PAYABLE, true)) {
            return [$order, $intent, 'این سفارش نیازی به پرداخت ندارد.'];
        }

        return [$order, $intent, null];
    }

    /** Handle /start pay_{id}: bind chat to the intent and send the invoice. */
    public function sendInvoice(int $tenantId, BotClient $client, string $chatId, int $orderId): bool
    {
        $order = Order::query()->where('tenant_id', $tenantId)->find($orderId);
        $intent = $order ? $this->intentFor($tenantId, $order->id) : null;
        if (! $order || ! $intent || $intent->status !== 'pending' || ! in_array($order->status, self::PAYABLE, true)) {
            $client->call('sendMessage', ['chat_id' => $chatId, 'text' => 'این سفارش قابل پرداخت نیست.']);

            return false;
        }
        $meta = $intent->meta ?? [];
        $bound = (string) ($meta['chat_id'] ?? '');
        if ($bound !== '' && $bound !== $chatId) {
            $client->call('sendMessage', ['chat_id' => $chatId, 'text' => 'این فاکتور متعلق به حساب دیگری است.']);

            return false;
        }
        $token = (string) ($this->gateways->getRaw($tenantId, 'bale_pay')['provider_token'] ?? '');
        if ($token === '') {
            $client->call('sendMessage', ['chat_id' => $chatId, 'text' => 'پرداخت بله برای این فروشگاه پیکربندی نشده است.']);

            return false;
        }
        $intent->update(['meta' => array_merge($meta, ['chat_id' => $chatId])]);
        $title = 'سفارش #'.($order->number ?? $order->id);
        $res = $client->call('sendInvoice', [
            'chat_id' => $chatId,
            'title' => $title,
            'description' => 'پرداخت از طریق بله',
            'payload' => self::sign($order->id),
            'provider_token' => $token,
            'currency' => 'IRR',
            'prices' => [['label' => $title, 'amount' => (int) ($meta['amount_rial'] ?? 0)]],
            'start_parameter' => 'pay_'.$order->id,
        ]);

        return (bool) $res['ok'];
    }

    /** @param array<string, mixed> $query */
    public function preCheckout(int $tenantId, BotClient $client, array $query): bool
    {
        [, $intent, $err] = $this->resolve($tenantId, (string) ($query['invoice_payload'] ?? ''));
        if (! $err && (int) ($query['total_amount'] ?? -1) !== (int) data_get($intent?->meta, 'amount_rial', -2)) {
            $err = 'مبلغ فاکتور با سفارش مطابقت ندارد.';
        }
        $payload = ['pre_checkout_query_id' => (string) ($query['id'] ?? ''), 'ok' => $err === null];
        if ($err) {
            $payload['error_message'] = $err;
        }
        $client->call('answerPreCheckoutQuery', $payload);

        return $err === null;
    }

    /** @param array<string, mixed> $payment successful_payment object */
    public function successfulPayment(int $tenantId, string $chatId, array $payment): bool
    {
        [$order, $intent, $err] = $this->resolve($tenantId, (string) ($payment['invoice_payload'] ?? ''));
        if ($err || ! $order || ! $intent) {
            return false;
        }
        $meta = $intent->meta ?? [];
        if ((int) ($payment['total_amount'] ?? -1) !== (int) ($meta['amount_rial'] ?? -2)
            || (string) ($meta['chat_id'] ?? '') !== $chatId) {
            $intent->update(['meta' => array_merge($meta, ['rejected_payment' => $payment])]);

            return false;
        }
        $txn = (string) ($payment['telegram_payment_charge_id'] ?? $payment['provider_payment_charge_id'] ?? '');
        $charged = (int) ($meta['charge_minor'] ?? 0);
        $this->statuses->apply($order->fresh(), 'paid', [
            'payment_ref' => $txn !== '' ? $txn : null,
            'payment_provider' => 'bale_pay',
            'amount_paid_minor' => $charged > 0 ? $charged : (int) $order->total_minor,
        ]);
        $intent->update(['status' => 'completed', 'meta' => array_merge($meta, ['charge_id' => $txn])]);
        try {
            $this->loyalty->awardForPaidOrder($order->fresh());
        } catch (\Throwable) {
        }

        return true;
    }
}
