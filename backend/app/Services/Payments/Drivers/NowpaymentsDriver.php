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
        $priceAmount = $this->fxMajorAmount($fx['amount'], 2, $fx['currency']);
        $base = ! empty($config['sandbox']) ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
        $ipn = $this->webhookUrl($callbackUrl, 'nowpayments');
        $payload = array_filter([
                'price_currency' => strtolower($fx['currency']),
                'pay_currency' => ($config['pay_currency'] ?? '') ?: null,
                'order_id' => (string) ($meta['order_id'] ?? ''),
                'order_description' => mb_substr($description, 0, 255),
                'ipn_callback_url' => $ipn,
                'success_url' => $callbackUrl,
                'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'nowpayments_status=cancel',
            ], fn ($v) => $v !== null && $v !== '');
        $body = '{"price_amount":'.$priceAmount.','.substr(json_encode($payload, JSON_THROW_ON_ERROR), 1);
        $response = Http::timeout(30)
            ->withHeaders(['x-api-key' => (string) $config['api_key']])
            ->acceptJson()
            ->withBody($body, 'application/json')
            ->post($base.'/v1/invoice')
            ->json();
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
        $invoiceId = (string) ($intentMeta['nowpayments_id'] ?? '');
        $paymentId = (string) ($callback['payment_id'] ?? '');
        if ($invoiceId === '' || $paymentId === ''
            || (isset($callback['invoice_id']) && (string) $callback['invoice_id'] !== $invoiceId)
            || ! isset($intentMeta['amount_rial'])
            || (string) $intentMeta['amount_rial'] !== (string) $amountRial) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
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
        if ((string) data_get($response, 'payment_id', '') !== $paymentId
            || (string) data_get($response, 'invoice_id', '') !== $invoiceId
            || ! $this->fxResponseMatches(data_get($response, 'price_amount'), data_get($response, 'price_currency'), $intentMeta)) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
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
