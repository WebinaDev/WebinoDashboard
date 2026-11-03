<?php

namespace App\Services\Payments\Drivers;

use Illuminate\Support\Facades\Http;

/**
 * Amounts are in toman (IRT). @see https://nextpay.org/nx/docs
 */
class NextpayDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'nextpay';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $apiKey = (string) ($config['api_key'] ?? '');
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'کلید API نکست‌پی خالی است.'];
        }
        $amountToman = (int) max(1, round($amountRial / 10));
        $response = Http::timeout(30)->asForm()->post('https://nextpay.org/nx/gateway/token', [
            'api_key' => $apiKey,
            'amount' => $amountToman,
            'order_id' => (string) ($meta['order_id'] ?? ''),
            'callback_uri' => $callbackUrl,
            'customer_phone' => (string) ($meta['mobile'] ?? ''),
        ])->json();
        $code = (int) data_get($response, 'code', -1);
        $transId = (string) data_get($response, 'trans_id', '');
        if ($code !== 0 || $transId === '') {
            return ['ok' => false, 'message' => 'NextPay request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://nextpay.org/nx/gateway/payment/'.$transId,
            'authority' => $transId,
            'meta' => [
                'nextpay_trans_id' => $transId,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $transId = (string) ($callback['trans_id'] ?? $intentMeta['nextpay_trans_id'] ?? '');
        if ($transId === '') {
            return ['ok' => false, 'message' => 'شناسه تراکنش نکست‌پی یافت نشد.'];
        }
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)->asForm()->post('https://nextpay.org/nx/gateway/verify', [
            'api_key' => (string) ($config['api_key'] ?? ''),
            'trans_id' => $transId,
            'amount' => $amountToman,
        ])->json();
        $code = (int) data_get($response, 'code', -1);
        if ($code !== 0) {
            return ['ok' => false, 'message' => 'تأیید نکست‌پی ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'Shaparak_Ref_Id', $transId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['api_key'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: api_key'];
        }

        return ['ok' => true, 'message' => 'پیکربندی نکست‌پی کامل است.'];
    }
}
