<?php

namespace App\Services\Payments\Drivers;

use App\Support\Currency;
use Illuminate\Support\Facades\Http;

class ZibalDriver implements GatewayDriverInterface
{
    public function code(): string
    {
        return 'zibal';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $merchant = (string) ($config['merchant_id'] ?? '');
        if ($merchant === '') {
            return ['ok' => false, 'message' => 'کد پذیرنده زیبال خالی است.'];
        }
        // Zibal docs: amount is always in rial. Do not divide when the store is IRT.
        $amount = max(1, Currency::fromRialToGateway($amountRial, Currency::apiUnitFor('zibal')));
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://gateway.zibal.ir/v1/request', [
            'merchant' => $merchant,
            'amount' => $amount,
            'callbackUrl' => $callbackUrl,
            'description' => mb_substr($description, 0, 255),
            'orderId' => (string) ($meta['order_id'] ?? ''),
        ])->json();
        $result = (int) data_get($response, 'result');
        if ($result !== 100) {
            return ['ok' => false, 'message' => 'Zibal request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }
        $trackId = (string) data_get($response, 'trackId');

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://gateway.zibal.ir/start/'.$trackId,
            'authority' => $trackId,
            'meta' => [
                'zibal_track_id' => $trackId,
                'amount_rial' => $amountRial,
                'currency' => 'IRR',
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $success = (int) ($callback['success'] ?? 0) === 1;
        $trackId = (string) ($callback['trackId'] ?? $intentMeta['zibal_track_id'] ?? '');
        if (! $success || $trackId === '') {
            return ['ok' => false, 'message' => 'پرداخت زیبال ناموفق یا لغو شد.'];
        }
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://gateway.zibal.ir/v1/verify', [
            'merchant' => (string) ($config['merchant_id'] ?? ''),
            'trackId' => $trackId,
        ])->json();
        $result = (int) data_get($response, 'result');
        if ($result !== 100) {
            return ['ok' => false, 'message' => 'تأیید زیبال ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'refNumber', data_get($response, 'cardNumber', '')),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['merchant_id'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: merchant_id'];
        }

        return ['ok' => true, 'message' => 'پیکربندی زیبال کامل است.'];
    }
}
