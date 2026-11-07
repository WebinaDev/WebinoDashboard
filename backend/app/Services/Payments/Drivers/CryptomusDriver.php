<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** @see https://doc.cryptomus.com/ */
class CryptomusDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string
    {
        return 'cryptomus';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['merchant_id', 'api_key'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $amount = number_format($fx['amount'] / 100, 2, '.', '');
        $orderId = (string) ($meta['order_id'] ?? Str::uuid());
        $payload = [
            'amount' => $amount,
            'currency' => $fx['currency'],
            'order_id' => $orderId,
            'url_return' => $callbackUrl,
            'url_callback' => $this->webhookUrl($callbackUrl),
            'is_payment_multiple' => false,
            'lifetime' => 3600,
        ];
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $sign = md5(base64_encode($body).(string) $config['api_key']);
        $response = Http::timeout(30)
            ->withHeaders([
                'merchant' => (string) $config['merchant_id'],
                'sign' => $sign,
                'Content-Type' => 'application/json',
            ])
            ->withBody($body, 'application/json')
            ->post('https://api.cryptomus.com/v1/payment')
            ->json();
        $uuid = (string) data_get($response, 'result.uuid', '');
        $url = (string) data_get($response, 'result.url', '');
        if ($uuid === '' || $url === '') {
            return ['ok' => false, 'message' => 'Cryptomus request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $uuid,
            'meta' => [
                'cryptomus_uuid' => $uuid,
                'provider_ref' => $uuid,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
                'order_id' => $orderId,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = strtolower((string) ($callback['status'] ?? $callback['payment_status'] ?? ''));
        $uuid = (string) ($callback['uuid'] ?? $intentMeta['cryptomus_uuid'] ?? '');
        if (in_array($status, ['paid', 'paid_over'], true) && $uuid !== '') {
            if (! $this->validIpnSign($config, $callback)) {
                return ['ok' => false, 'message' => 'امضای IPN کریپتوموس نامعتبر است.'];
            }

            return [
                'ok' => true,
                'message' => 'verified',
                'ref_id' => $uuid,
                'meta' => $callback,
            ];
        }
        if ($uuid === '') {
            return ['ok' => false, 'message' => 'شناسه پرداخت Cryptomus یافت نشد.'];
        }
        $payload = ['uuid' => $uuid];
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $sign = md5(base64_encode($body).(string) ($config['api_key'] ?? ''));
        $response = Http::timeout(30)
            ->withHeaders([
                'merchant' => (string) ($config['merchant_id'] ?? ''),
                'sign' => $sign,
                'Content-Type' => 'application/json',
            ])
            ->withBody($body, 'application/json')
            ->post('https://api.cryptomus.com/v1/payment/info')
            ->json();
        $paymentStatus = strtolower((string) data_get($response, 'result.payment_status', data_get($response, 'result.status', '')));
        if (! in_array($paymentStatus, ['paid', 'paid_over'], true)) {
            return ['ok' => false, 'message' => 'تأیید Cryptomus هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'result.uuid', $uuid),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['merchant_id', 'api_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی Cryptomus کامل است.'];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $callback */
    private function validIpnSign(array $config, array $callback): bool
    {
        $sign = (string) ($callback['sign'] ?? '');
        if ($sign === '') {
            return true; // browser return without IPN signature
        }
        $payload = $callback;
        unset($payload['sign']);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $expected = md5(base64_encode((string) $body).(string) ($config['api_key'] ?? ''));

        return hash_equals($expected, $sign);
    }

    private function webhookUrl(string $callbackUrl): string
    {
        if (preg_match('#^(https?://[^/]+)#i', $callbackUrl, $m)) {
            return $m[1].'/api/v1/payments/webhook/cryptomus';
        }

        return $callbackUrl;
    }
}
