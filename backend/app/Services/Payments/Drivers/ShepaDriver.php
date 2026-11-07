<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://shepa.com/doc/rial-gateway/ */
class ShepaDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'shepa'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $sandbox = ! empty($config['sandbox']);
        $api = $sandbox ? 'sandbox' : (string) $config['api_key'];
        $base = $sandbox ? 'https://sandbox.shepa.com' : 'https://merchant.shepa.com';
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/api/v1/token', array_filter([
            'api' => $api,
            'amount' => $amountRial,
            'callback' => $callbackUrl,
            'mobile' => $meta['mobile'] ?? null,
            'email' => $meta['email'] ?? null,
            'description' => mb_substr($description, 0, 255),
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $ok = filter_var(data_get($response, 'success'), FILTER_VALIDATE_BOOLEAN);
        $token = (string) data_get($response, 'result.token', '');
        $url = (string) data_get($response, 'result.url', '');
        if (! $ok || $token === '') {
            return ['ok' => false, 'message' => 'Shepa request failed: '.(data_get($response, 'errors') ?? json_encode($response))];
        }
        if ($url === '') {
            $url = rtrim($base, '/').'/v1/'.$token;
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $token,
            'meta' => ['shepa_token' => $token, 'amount_rial' => $amountRial],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (strtolower((string) ($callback['status'] ?? '')) !== 'success') {
            return ['ok' => false, 'message' => 'پرداخت شپا لغو یا ناموفق بود.'];
        }
        $token = (string) ($callback['token'] ?? $intentMeta['shepa_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن شپا یافت نشد.'];
        }
        $sandbox = ! empty($config['sandbox']);
        $api = $sandbox ? 'sandbox' : (string) ($config['api_key'] ?? '');
        $base = $sandbox ? 'https://sandbox.shepa.com' : 'https://merchant.shepa.com';
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/api/v1/verify', [
            'api' => $api,
            'token' => $token,
            'amount' => $amountRial,
        ])->json();
        $ok = filter_var(data_get($response, 'success'), FILTER_VALIDATE_BOOLEAN);
        if (! $ok) {
            return ['ok' => false, 'message' => 'تأیید شپا ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'result.refid', data_get($response, 'result.transaction_id', $token)),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key']) ?? ['ok' => true, 'message' => 'پیکربندی شپا کامل است.'];
    }
}
