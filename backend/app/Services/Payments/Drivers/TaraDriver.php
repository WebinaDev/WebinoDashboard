<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Tara360 club credit / BNPL IPG.
 * @see https://pay.tara360.ir/pay + WooCommerce tara360-gateway plugin
 */
class TaraDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;

    public function code(): string { return 'tara'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['username', 'password'])) {
            return $miss;
        }
        $mobile = (string) ($meta['mobile'] ?? '');
        if ($mobile === '') {
            return ['ok' => false, 'message' => 'شماره موبایل برای تارا الزامی است.'];
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://pay.tara360.ir/pay'), '/');
        $access = $this->authenticate($base, $config);
        if ($access === null) {
            return ['ok' => false, 'message' => 'احراز هویت تارا ناموفق بود.'];
        }
        $orderId = (string) ($meta['order_id'] ?? time());
        $body = [
            'additionalData' => mb_substr($description, 0, 100),
            'mobile' => $mobile,
            'callBackURL' => $callbackUrl,
            'amount' => $amountRial,
            'ip' => (string) ($meta['ip'] ?? request()->ip() ?? '127.0.0.1'),
            'taraInvoiceItemList' => [[
                'name' => mb_substr($description, 0, 80) ?: ('Order '.$orderId),
                'code' => $orderId,
                'count' => 1,
                'unit' => 5,
                'fee' => $amountRial,
                'group' => (string) ($config['group'] ?? '26'),
                'groupTitle' => (string) ($config['group_title'] ?? 'سایر'),
                'data' => mb_substr($description, 0, 80),
            ]],
        ];
        $response = Http::timeout(40)
            ->withToken($access)
            ->acceptJson()->asJson()
            ->post($base.'/api/getToken', $body)
            ->json();
        $token = (string) data_get($response, 'token', '');
        $result = (string) data_get($response, 'result', data_get($response, 'Result', ''));
        if ($token === '' || ($result !== '' && $result !== '0' && strtolower($result) !== 'success')) {
            // Some Tara responses only return token on success without result=0.
            if ($token === '') {
                return ['ok' => false, 'message' => 'Tara request failed: '.(data_get($response, 'description') ?? data_get($response, 'message') ?? json_encode($response))];
            }
        }
        $bridge = $this->formBridgeMeta($base.'/api/ipgPurchase', [
            'username' => (string) $config['username'],
            'token' => $token,
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $token,
            'meta' => array_merge($bridge, [
                'tara_token' => $token,
                'tara_access_token' => $access,
                'amount_rial' => $amountRial,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $code = (string) ($callback['result'] ?? $callback['status'] ?? '0');
        if ($code !== '0' && strtolower($code) !== 'success') {
            return ['ok' => false, 'message' => 'پرداخت تارا ناموفق بود.'];
        }
        $token = (string) ($callback['token'] ?? $intentMeta['tara_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن تارا یافت نشد.'];
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://pay.tara360.ir/pay'), '/');
        $access = (string) ($intentMeta['tara_access_token'] ?? '');
        if ($access === '') {
            $access = (string) ($this->authenticate($base, $config) ?? '');
        }
        if ($access === '') {
            return ['ok' => false, 'message' => 'احراز هویت تارا ناموفق بود.'];
        }
        $response = Http::timeout(40)
            ->withToken($access)
            ->acceptJson()->asJson()
            ->post($base.'/api/purchaseVerify', [
                'token' => $token,
                'ip' => (string) ($callback['ip'] ?? request()->ip() ?? '127.0.0.1'),
            ])->json();
        $result = (string) data_get($response, 'result', data_get($response, 'Result', '0'));
        $rrn = (string) data_get($response, 'rrn', data_get($response, 'RRN', data_get($response, 'channelRefNumber', '')));
        if ($result !== '0' && strtolower($result) !== 'success' && $rrn === '') {
            return ['ok' => false, 'message' => 'تأیید تارا ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $rrn !== '' ? $rrn : $token,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['username', 'password'])
            ?? ['ok' => true, 'message' => 'پیکربندی تارا کامل است.'];
    }

    /** @param  array<string, mixed>  $config */
    private function authenticate(string $base, array $config): ?string
    {
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/api/v2/authenticate', [
            'username' => (string) $config['username'],
            'password' => (string) $config['password'],
        ])->json();
        $token = (string) data_get($response, 'accessToken', data_get($response, 'access_token', ''));

        return $token !== '' ? $token : null;
    }
}
