<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://documenter.getpostman.com/view/7907941/S1a32n38 */
class NowpaymentsDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string
    {
        return 'nowpayments';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $priceAmount = round($fx['amount'] / 100, 2);
        $base = ! empty($config['sandbox']) ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
        $ipn = $this->webhookUrl($callbackUrl, 'nowpayments');
        $response = Http::timeout(30)
            ->withHeaders(['x-api-key' => (string) $config['api_key']])
            ->acceptJson()
            ->asJson()
            ->post($base.'/v1/invoice', array_filter([
                'price_amount' => $priceAmount,
                'price_currency' => strtolower($fx['currency']),
                'pay_currency' => ($config['pay_currency'] ?? '') ?: null,
                'order_id' => (string) ($meta['order_id'] ?? ''),
                'order_description' => mb_substr($description, 0, 255),
                'ipn_callback_url' => $ipn,
                'success_url' => $callbackUrl,
                'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'nowpayments_status=cancel',
            ], fn ($v) => $v !== null && $v !== ''))->json();
        $id = (string) data_get($response, 'id', '');
        $url = (string) data_get($response, 'invoice_url', '');
        if ($id === '' || $url === '') {
            return ['ok' => false, 'message' => 'NOWPayments request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $id,
            'meta' => [
                'nowpayments_id' => $id,
                'provider_ref' => $id,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['nowpayments_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت NOWPayments لغو شد.'];
        }
        // IPN path: payment_status / payment_id on body.
        $status = strtolower((string) ($callback['payment_status'] ?? $callback['status'] ?? ''));
        $paymentId = (string) ($callback['payment_id'] ?? $callback['invoice_id'] ?? $intentMeta['nowpayments_id'] ?? '');
        if (in_array($status, ['finished', 'confirmed', 'sending'], true) && $paymentId !== '') {
            return [
                'ok' => true,
                'message' => 'verified',
                'ref_id' => $paymentId,
                'meta' => $callback,
            ];
        }
        if ($paymentId === '') {
            return ['ok' => false, 'message' => 'شناسه پرداخت NOWPayments یافت نشد.'];
        }
        $base = ! empty($config['sandbox']) ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
        $response = Http::timeout(30)
            ->withHeaders(['x-api-key' => (string) ($config['api_key'] ?? '')])
            ->get($base.'/v1/payment/'.$paymentId)
            ->json();
        $paymentStatus = strtolower((string) data_get($response, 'payment_status', ''));
        if (! in_array($paymentStatus, ['finished', 'confirmed'], true)) {
            return ['ok' => false, 'message' => 'تأیید NOWPayments هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'payment_id', $paymentId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی NOWPayments کامل است.'];
    }

    private function webhookUrl(string $callbackUrl, string $provider): string
    {
        // Prefer site public API webhook if callback is on same host.
        if (preg_match('#^(https?://[^/]+)#i', $callbackUrl, $m)) {
            return $m[1].'/api/v1/payments/webhook/'.$provider;
        }

        return $callbackUrl;
    }
}
