<?php

namespace App\Services\Payments\Drivers;

use Illuminate\Support\Facades\Http;

/**
 * Amounts are in rial. @see https://docs.pay.ir
 */
class PayirDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'payir';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $apiKey = (string) ($config['api_key'] ?? '');
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'کلید API پی خالی است.'];
        }
        if (! empty($config['sandbox'])) {
            $apiKey = 'test';
        }
        $response = Http::timeout(30)->asForm()->post('https://pay.ir/pg/send', [
            'api' => $apiKey,
            'amount' => $amountRial,
            'redirect' => $callbackUrl,
            'description' => mb_substr($description, 0, 255),
            'factorNumber' => (string) ($meta['order_id'] ?? ''),
            'mobile' => (string) ($meta['mobile'] ?? ''),
        ])->json();
        $status = (int) data_get($response, 'status', 0);
        $token = (string) data_get($response, 'token', '');
        if ($status !== 1 || $token === '') {
            return ['ok' => false, 'message' => 'Pay.ir request failed: '.(data_get($response, 'errorMessage') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://pay.ir/pg/'.$token,
            'authority' => $token,
            'meta' => [
                'payir_token' => $token,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = (int) ($callback['status'] ?? 0);
        $token = (string) ($callback['token'] ?? $intentMeta['payir_token'] ?? '');
        if ($status !== 1 || $token === '') {
            return ['ok' => false, 'message' => 'پرداخت پی ناموفق یا لغو شد.'];
        }
        $apiKey = (string) ($config['api_key'] ?? '');
        if (! empty($config['sandbox'])) {
            $apiKey = 'test';
        }
        $response = Http::timeout(30)->asForm()->post('https://pay.ir/pg/verify', [
            'api' => $apiKey,
            'token' => $token,
        ])->json();
        $verifyStatus = (int) data_get($response, 'status', 0);
        if ($verifyStatus !== 1) {
            return ['ok' => false, 'message' => 'تأیید پی ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        $paid = (int) data_get($response, 'amount', 0);
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'transId', $token),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['api_key'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: api_key'];
        }

        return ['ok' => true, 'message' => 'پیکربندی پی کامل است.'];
    }
}
