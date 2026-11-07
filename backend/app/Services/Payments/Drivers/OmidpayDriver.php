<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** OmidPay / SayanCard IPG. */
class OmidpayDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;

    public function code(): string { return 'omidpay'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['username', 'password'])) {
            return $miss;
        }
        $merchantId = (string) ($config['merchant_id'] ?? $config['username']);
        $response = Http::timeout(40)->acceptJson()->asJson()->post(
            'https://ref.sayancard.ir/ref-payment/RestServices/mts/generateTokenWithNoSign/',
            [
                'WSContext' => [
                    'UserId' => (string) $config['username'],
                    'Password' => (string) $config['password'],
                ],
                'TransType' => 'EN_GOODS',
                'ReserveNum' => (string) ($meta['order_id'] ?? uniqid('om_', true)),
                'MerchantId' => $merchantId,
                'Amount' => $amountRial,
                'RedirectUrl' => $callbackUrl,
            ]
        )->json();
        if ((string) data_get($response, 'Result', '') !== 'erSucceed') {
            return ['ok' => false, 'message' => 'OmidPay request failed: '.(data_get($response, 'Result') ?? json_encode($response))];
        }
        $token = (string) data_get($response, 'Token', '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'OmidPay token missing.'];
        }
        $bridge = $this->formBridgeMeta('https://say.shaparak.ir/_ipgw_/MainTemplate/payment/', [
            'token' => $token,
            'language' => 'fa',
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $token,
            'meta' => array_merge($bridge, [
                'omidpay_token' => $token,
                'amount_rial' => $amountRial,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $token = (string) ($callback['token'] ?? $intentMeta['omidpay_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن امیدپی یافت نشد.'];
        }
        $response = Http::timeout(40)->acceptJson()->asJson()->post(
            'https://ref.sayancard.ir/ref-payment/RestServices/mts/verifyMerchantTrans/',
            [
                'WSContext' => [
                    'UserId' => (string) ($config['username'] ?? ''),
                    'Password' => (string) ($config['password'] ?? ''),
                ],
                'Token' => $token,
                'RefNum' => (string) ($callback['RefNum'] ?? $callback['refNum'] ?? ''),
            ]
        )->json();
        if ((string) data_get($response, 'Result', '') !== 'erSucceed') {
            return ['ok' => false, 'message' => 'تأیید امیدپی ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'RefNum', $token),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['username', 'password'])
            ?? ['ok' => true, 'message' => 'پیکربندی امیدپی کامل است.'];
    }
}
