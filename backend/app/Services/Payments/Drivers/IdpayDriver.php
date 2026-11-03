<?php

namespace App\Services\Payments\Drivers;

use Illuminate\Support\Facades\Http;

/**
 * @see https://idpay.ir/web-service/v1.1/
 */
class IdpayDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'idpay';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $apiKey = (string) ($config['api_key'] ?? '');
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'کلید API آیدی‌پی خالی است.'];
        }
        $headers = [
            'X-API-KEY' => $apiKey,
            'Content-Type' => 'application/json',
        ];
        if (! empty($config['sandbox'])) {
            $headers['X-SANDBOX'] = '1';
        }
        $response = Http::timeout(30)->withHeaders($headers)->acceptJson()->asJson()->post('https://api.idpay.ir/v1.1/payment', [
            'order_id' => (string) ($meta['order_id'] ?? ''),
            'amount' => $amountRial,
            'callback' => $callbackUrl,
            'desc' => mb_substr($description, 0, 255),
            'name' => (string) ($meta['name'] ?? ''),
            'phone' => (string) ($meta['mobile'] ?? ''),
            'mail' => (string) ($meta['email'] ?? ''),
        ])->json();
        $id = (string) data_get($response, 'id', '');
        $link = (string) data_get($response, 'link', '');
        if ($id === '' || $link === '') {
            $msg = data_get($response, 'error_message') ?? data_get($response, 'message') ?? json_encode($response);

            return ['ok' => false, 'message' => 'IDPay request failed: '.$msg];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $link,
            'authority' => $id,
            'meta' => [
                'idpay_id' => $id,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = (int) ($callback['status'] ?? 0);
        $id = (string) ($callback['id'] ?? $intentMeta['idpay_id'] ?? '');
        $orderId = (string) ($callback['order_id'] ?? $intentMeta['order_id'] ?? '');
        if ($status !== 10 || $id === '') {
            return ['ok' => false, 'message' => 'پرداخت آیدی‌پی ناموفق یا در انتظار تأیید است.'];
        }
        $headers = [
            'X-API-KEY' => (string) ($config['api_key'] ?? ''),
            'Content-Type' => 'application/json',
        ];
        if (! empty($config['sandbox'])) {
            $headers['X-SANDBOX'] = '1';
        }
        $response = Http::timeout(30)->withHeaders($headers)->acceptJson()->asJson()->post('https://api.idpay.ir/v1.1/payment/verify', [
            'id' => $id,
            'order_id' => $orderId,
        ])->json();
        $verifyStatus = (int) data_get($response, 'status', 0);
        if (! in_array($verifyStatus, [100, 101], true)) {
            return ['ok' => false, 'message' => 'تأیید آیدی‌پی ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        $paid = (int) data_get($response, 'amount', 0);
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'track_id', data_get($response, 'payment.track_id', '')),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['api_key'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: api_key'];
        }

        return ['ok' => true, 'message' => 'پیکربندی آیدی‌پی کامل است.'];
    }
}
