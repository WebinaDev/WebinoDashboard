<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://core.paystar.ir (Bearer gateway id + HMAC-SHA512) */
class PaystarDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'paystar'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $orderId = (string) ($meta['order_id'] ?? uniqid('ps_', true));
        $signKey = (string) ($config['sign_key'] ?? $config['api_key']);
        $payload = [
            'amount' => $amountRial,
            'order_id' => $orderId,
            'callback' => $callbackUrl,
            'sign' => hash_hmac('sha512', "{$amountRial}#{$orderId}#{$callbackUrl}", $signKey),
            'description' => mb_substr($description, 0, 255),
            'phone' => $meta['mobile'] ?? null,
            'mail' => $meta['email'] ?? null,
        ];
        $response = Http::timeout(30)
            ->withToken((string) $config['api_key'])
            ->acceptJson()->asJson()
            ->post('https://core.paystar.ir/api/pardakht/create', array_filter($payload, fn ($v) => $v !== null && $v !== ''))
            ->json();
        if ((int) data_get($response, 'status', 0) !== 1) {
            return ['ok' => false, 'message' => 'Paystar request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }
        $token = (string) data_get($response, 'data.token', '');
        $ref = (string) data_get($response, 'data.ref_num', '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'Paystar token missing.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://core.paystar.ir/api/pardakht/payment?token='.urlencode($token),
            'authority' => $ref !== '' ? $ref : $token,
            'meta' => [
                'paystar_token' => $token,
                'paystar_ref_num' => $ref,
                'paystar_order_id' => $orderId,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if ((int) ($callback['status'] ?? 0) !== 1) {
            return ['ok' => false, 'message' => 'پرداخت پی‌استار ناموفق بود.'];
        }
        $ref = (string) ($callback['ref_num'] ?? $intentMeta['paystar_ref_num'] ?? '');
        $card = (string) ($callback['card_number'] ?? '');
        $tracking = (string) ($callback['tracking_code'] ?? '');
        if ($ref === '') {
            return ['ok' => false, 'message' => 'مرجع پی‌استار یافت نشد.'];
        }
        $signKey = (string) ($config['sign_key'] ?? $config['api_key'] ?? '');
        $sign = $tracking !== ''
            ? hash_hmac('sha512', "{$amountRial}#{$ref}#{$card}#{$tracking}", $signKey)
            : hash_hmac('sha512', "{$amountRial}#{$ref}#{$card}", $signKey);
        $body = array_filter([
            'amount' => $amountRial,
            'ref_num' => $ref,
            'tracking_code' => $tracking ?: null,
            'sign' => $sign,
        ], fn ($v) => $v !== null && $v !== '');
        $response = Http::timeout(30)
            ->withToken((string) ($config['api_key'] ?? ''))
            ->acceptJson()->asJson()
            ->post('https://core.paystar.ir/api/pardakht/verify', $body)
            ->json();
        if ((int) data_get($response, 'status', 0) !== 1) {
            return ['ok' => false, 'message' => 'تأیید پی‌استار ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $tracking !== '' ? $tracking : $ref,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key']) ?? ['ok' => true, 'message' => 'پیکربندی پی‌استار کامل است.'];
    }
}
