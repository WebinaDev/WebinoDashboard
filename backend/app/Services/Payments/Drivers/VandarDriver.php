<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://docs.vandar.io/ipg_service/ipg */
class VandarDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'vandar';
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
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://ipg.vandar.io/api/v4/send', array_filter([
            'api_key' => (string) $config['api_key'],
            'amount' => $amountRial,
            'callback_url' => $callbackUrl,
            'mobile_number' => $meta['mobile'] ?? null,
            'factorNumber' => (string) ($meta['order_id'] ?? ''),
            'description' => mb_substr($description, 0, 255),
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $token = (string) data_get($response, 'token', '');
        if ((int) data_get($response, 'status', 0) !== 1 || $token === '') {
            $msg = data_get($response, 'errors.0') ?? data_get($response, 'message') ?? json_encode($response);

            return ['ok' => false, 'message' => 'Vandar request failed: '.$msg];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://ipg.vandar.io/v4/'.$token,
            'authority' => $token,
            'meta' => [
                'vandar_token' => $token,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $token = (string) ($callback['token'] ?? $intentMeta['vandar_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن پرداخت وندار یافت نشد.'];
        }
        $paymentStatus = (int) ($callback['payment_status'] ?? 1);
        if ($paymentStatus === 0) {
            return ['ok' => false, 'message' => 'پرداخت وندار لغو یا ناموفق بود.'];
        }
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://ipg.vandar.io/api/v4/verify', [
            'api_key' => (string) ($config['api_key'] ?? ''),
            'token' => $token,
        ])->json();
        if ((int) data_get($response, 'status', 0) !== 1) {
            return ['ok' => false, 'message' => 'تأیید وندار ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        $paid = (int) round((float) data_get($response, 'amount', 0));
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
        return $this->missingRequired($config, ['api_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی وندار کامل است.'];
    }
}
