<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * BitPay.ir (Iranian aggregator). Amounts are in tomans.
 *
 * @see https://bitpay.ir/plugins
 */
class BitpayDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'bitpay';
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
        $amountToman = max(1, (int) round($amountRial / 10));
        $response = Http::timeout(30)->asForm()->post('https://bitpay.ir/payment/gateway-send', [
            'api' => (string) $config['api_key'],
            'amount' => $amountToman,
            'redirect' => $callbackUrl,
            'name' => (string) ($meta['name'] ?? ''),
            'email' => (string) ($meta['email'] ?? ''),
            'description' => mb_substr($description, 0, 255),
            'factorId' => (string) ($meta['order_id'] ?? ''),
        ]);
        $body = trim((string) $response->body());
        $idGet = is_numeric($body) ? (int) $body : (int) data_get($response->json(), 'id_get', 0);
        if ($idGet <= 0) {
            return ['ok' => false, 'message' => 'BitPay.ir request failed: '.$body];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://bitpay.ir/payment/gateway-'.$idGet.'-get',
            'authority' => (string) $idGet,
            'meta' => [
                'bitpay_id_get' => (string) $idGet,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $idGet = (string) ($callback['id_get'] ?? $intentMeta['bitpay_id_get'] ?? '');
        $transId = (string) ($callback['trans_id'] ?? $callback['transId'] ?? '');
        if ($idGet === '' || $transId === '') {
            return ['ok' => false, 'message' => 'پرداخت بیت‌پی ناموفق یا ناقص بود.'];
        }
        $response = Http::timeout(30)->asForm()->post('https://bitpay.ir/payment/gateway-result-second', [
            'api' => (string) ($config['api_key'] ?? ''),
            'id_get' => $idGet,
            'trans_id' => $transId,
        ]);
        $body = trim((string) $response->body());
        $json = $response->json();
        $status = is_array($json) ? (int) data_get($json, 'status', 0) : (is_numeric($body) ? (int) $body : 0);
        // Official samples treat 1 (or positive status codes in JSON) as success.
        if ($status < 1) {
            return ['ok' => false, 'message' => 'تأیید بیت‌پی ناموفق بود.', 'meta' => ['raw' => $body]];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $transId,
            'meta' => is_array($json) ? $json : ['raw' => $body],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی بیت‌پی کامل است.'];
    }
}
