<?php

namespace App\Services\Payments\Drivers;

use App\Support\Currency;
use Illuminate\Support\Facades\Http;

class ZarinpalDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'zarinpal';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $merchantId = (string) ($config['merchant_id'] ?? '');
        if ($merchantId === '') {
            return ['ok' => false, 'message' => 'شناسه پذیرنده زرین‌پال خالی است.'];
        }
        $sandbox = (bool) ($config['sandbox'] ?? true);
        $requestUrl = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/request.json';
        $currency = Currency::apiUnitFor('zarinpal', (string) ($meta['currency'] ?? 'IRT'));
        $amount = max(1, Currency::fromRialToGateway($amountRial, $currency));
        $response = Http::timeout(30)->acceptJson()->asJson()->post($requestUrl, [
            'merchant_id' => $merchantId,
            'amount' => $amount,
            'currency' => $currency,
            'callback_url' => $callbackUrl,
            'description' => mb_substr($description, 0, 255),
            'metadata' => array_filter([
                'order_id' => (string) ($meta['order_id'] ?? ''),
                'mobile' => $meta['mobile'] ?? null,
                'email' => $meta['email'] ?? null,
            ]),
        ])->json();
        $code = (int) data_get($response, 'data.code');
        if ($code !== 100) {
            $msg = data_get($response, 'errors.message') ?? data_get($response, 'data.message') ?? json_encode($response);

            return ['ok' => false, 'message' => 'Zarinpal request failed: '.$msg];
        }
        $authority = (string) data_get($response, 'data.authority');
        $startPay = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/StartPay/'.$authority
            : 'https://www.zarinpal.com/pg/StartPay/'.$authority;

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $startPay,
            'authority' => $authority,
            'meta' => [
                'zarinpal_authority' => $authority,
                'amount_rial' => $amountRial,
                'currency' => $currency,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = strtoupper((string) ($callback['Status'] ?? $callback['status'] ?? ''));
        if ($status === 'NOK') {
            return ['ok' => false, 'message' => 'پرداخت توسط کاربر لغو شد.'];
        }
        $sandbox = (bool) ($config['sandbox'] ?? true);
        $verifyUrl = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
        $currency = Currency::apiUnitFor('zarinpal', (string) ($intentMeta['currency'] ?? 'IRT'));
        $amount = max(1, Currency::fromRialToGateway($amountRial, $currency));
        $authority = (string) ($callback['Authority'] ?? $callback['authority'] ?? $intentMeta['zarinpal_authority'] ?? '');
        $response = Http::timeout(30)->acceptJson()->asJson()->post($verifyUrl, [
            'merchant_id' => (string) ($config['merchant_id'] ?? ''),
            'amount' => $amount,
            'authority' => $authority,
        ])->json();
        $code = (int) data_get($response, 'data.code');
        if (! in_array($code, [100, 101], true)) {
            return ['ok' => false, 'message' => 'تأیید زرین‌پال ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => $code === 101 ? 'already-verified' : 'verified',
            'ref_id' => (string) data_get($response, 'data.ref_id', ''),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['merchant_id'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: merchant_id'];
        }

        return ['ok' => true, 'message' => 'پیکربندی زرین‌پال کامل است.'];
    }
}
