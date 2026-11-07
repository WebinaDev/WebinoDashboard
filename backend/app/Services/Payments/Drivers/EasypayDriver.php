<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * EasyPay (ایزی‌پی / ezpay.ir) — merchant Token API.
 * Request/verify follow the same Bearer JSON shape used by Payzito-connected plugins.
 */
class EasypayDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'easypay'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://api.ezpay.ir'), '/');
        $amountToman = max(1, (int) round($amountRial / 10));
        $response = Http::timeout(30)
            ->withToken((string) $config['api_key'])
            ->acceptJson()->asJson()
            ->post($base.'/v1/payment', array_filter([
                'amount' => $amountToman,
                'callback' => $callbackUrl,
                'description' => mb_substr($description, 0, 255),
                'mobile' => $meta['mobile'] ?? null,
                'email' => $meta['email'] ?? null,
                'order_id' => (string) ($meta['order_id'] ?? ''),
            ], fn ($v) => $v !== null && $v !== ''))->json();
        $token = (string) data_get($response, 'token', data_get($response, 'data.token', data_get($response, 'authority', '')));
        $url = (string) data_get($response, 'url', data_get($response, 'data.url', data_get($response, 'payment_url', '')));
        if ($token === '') {
            return ['ok' => false, 'message' => 'EasyPay request failed: '.json_encode($response)];
        }
        if ($url === '') {
            $url = $base.'/v1/pay/'.$token;
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $token,
            'meta' => [
                'easypay_token' => $token,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $token = (string) ($callback['token'] ?? $callback['authority'] ?? $intentMeta['easypay_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن ایزی‌پی یافت نشد.'];
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://api.ezpay.ir'), '/');
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)
            ->withToken((string) ($config['api_key'] ?? ''))
            ->acceptJson()->asJson()
            ->post($base.'/v1/verify', [
                'token' => $token,
                'amount' => $amountToman,
            ])->json();
        $status = strtolower((string) data_get($response, 'status', data_get($response, 'data.status', '')));
        $ok = filter_var(data_get($response, 'success', data_get($response, 'ok')), FILTER_VALIDATE_BOOLEAN)
            || in_array($status, ['ok', 'success', 'paid', 'verified', '1', '100'], true)
            || (int) data_get($response, 'code', 0) === 100;
        $ref = (string) data_get($response, 'ref_id', data_get($response, 'data.ref_id', ''));
        // Do not treat a bare ref_id as success when the provider reports failure.
        if (! $ok || $ref === '') {
            return ['ok' => false, 'message' => 'تأیید ایزی‌پی ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $ref,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key']) ?? ['ok' => true, 'message' => 'پیکربندی ایزی‌پی کامل است.'];
    }
}
