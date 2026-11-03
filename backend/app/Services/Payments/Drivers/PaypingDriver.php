<?php

namespace App\Services\Payments\Drivers;

use Illuminate\Support\Facades\Http;

/**
 * Amounts are in toman. @see https://docs.payping.ir
 */
class PaypingDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'payping';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $token = (string) ($config['api_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن پی‌پینگ خالی است.'];
        }
        $amountToman = (int) max(1, round($amountRial / 10));
        $response = Http::timeout(30)
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->post('https://api.payping.ir/v2/pay', [
                'amount' => $amountToman,
                'returnUrl' => $callbackUrl,
                'payerIdentity' => (string) ($meta['mobile'] ?? $meta['email'] ?? ''),
                'payerName' => (string) ($meta['name'] ?? ''),
                'description' => mb_substr($description, 0, 255),
                'clientRefId' => (string) ($meta['order_id'] ?? ''),
            ]);
        if (! $response->successful()) {
            $body = $response->json();
            $msg = is_array($body) ? (data_get($body, 'meta.message') ?? json_encode($body)) : $response->body();

            return ['ok' => false, 'message' => 'PayPing request failed: '.$msg];
        }
        $code = (string) data_get($response->json(), 'code', $response->body());
        $code = trim($code, "\" \n\r\t");
        if ($code === '') {
            return ['ok' => false, 'message' => 'PayPing response missing payment code.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://api.payping.ir/v2/pay/goto/'.$code,
            'authority' => $code,
            'meta' => [
                'payping_code' => $code,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $refId = (string) ($callback['refid'] ?? $callback['refId'] ?? $callback['clientrefid'] ?? '');
        if ($refId === '') {
            return ['ok' => false, 'message' => 'کد پیگیری پی‌پینگ یافت نشد.'];
        }
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)
            ->withToken((string) ($config['api_token'] ?? ''))
            ->acceptJson()
            ->asJson()
            ->post('https://api.payping.ir/v2/pay/verify', [
                'refId' => is_numeric($refId) ? (int) $refId : $refId,
                'amount' => $amountToman,
            ]);
        if (! $response->successful()) {
            return ['ok' => false, 'message' => 'تأیید پی‌پینگ ناموفق بود.', 'meta' => $response->json() ?: []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) $refId,
            'meta' => $response->json() ?: [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['api_token'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: api_token'];
        }

        return ['ok' => true, 'message' => 'پیکربندی پی‌پینگ کامل است.'];
    }
}
