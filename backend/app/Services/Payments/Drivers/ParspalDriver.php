<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://api.parspal.com/v1/payment */
class ParspalDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'parspal'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $sandbox = ! empty($config['sandbox']);
        $apiKey = $sandbox ? '00000000aaaabbbbcccc000000000000' : (string) $config['api_key'];
        $url = $sandbox
            ? 'https://sandbox.api.parspal.com/v1/payment/request'
            : 'https://api.parspal.com/v1/payment/request';
        $amountToman = max(1, (int) round($amountRial / 10));
        $response = Http::timeout(30)
            ->withHeaders(['ApiKey' => $apiKey, 'APIKEY' => $apiKey])
            ->acceptJson()->asJson()
            ->post($url, [
                'amount' => $amountToman,
                'return_url' => $callbackUrl,
                'order_id' => (string) ($meta['order_id'] ?? ''),
                'description' => mb_substr($description, 0, 255),
                'payer' => array_filter([
                    'name' => $meta['name'] ?? null,
                    'mobile' => $meta['mobile'] ?? null,
                    'email' => $meta['email'] ?? null,
                ]),
            ])->json();
        if (strtoupper((string) data_get($response, 'status', '')) !== 'ACCEPTED') {
            return ['ok' => false, 'message' => 'ParsPal request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }
        $link = (string) data_get($response, 'link', '');
        $paymentId = (string) data_get($response, 'payment_id', '');
        if ($link === '') {
            return ['ok' => false, 'message' => 'ParsPal link missing.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $link,
            'authority' => $paymentId,
            'meta' => [
                'parspal_payment_id' => $paymentId,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if ((string) ($callback['status'] ?? '') !== '100') {
            return ['ok' => false, 'message' => 'پرداخت پارس‌پال ناموفق بود.'];
        }
        $receipt = (string) ($callback['receipt_number'] ?? '');
        if ($receipt === '') {
            return ['ok' => false, 'message' => 'شماره رسید پارس‌پال یافت نشد.'];
        }
        $sandbox = ! empty($config['sandbox']);
        $apiKey = $sandbox ? '00000000aaaabbbbcccc000000000000' : (string) ($config['api_key'] ?? '');
        $url = $sandbox
            ? 'https://sandbox.api.parspal.com/v1/payment/verify'
            : 'https://api.parspal.com/v1/payment/verify';
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)
            ->withHeaders(['ApiKey' => $apiKey, 'APIKEY' => $apiKey])
            ->acceptJson()->asJson()
            ->post($url, ['amount' => $amountToman, 'receipt_number' => $receipt])
            ->json();
        if (strtoupper((string) data_get($response, 'status', '')) !== 'SUCCESSFUL') {
            return ['ok' => false, 'message' => 'تأیید پارس‌پال ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $receipt,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key']) ?? ['ok' => true, 'message' => 'پیکربندی پارس‌پال کامل است.'];
    }
}
