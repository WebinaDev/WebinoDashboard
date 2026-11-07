<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** Jibit PPG v3 — token handshake then purchases. @see https://docs.jibit.ir */
class JibitDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'jibit'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key', 'secret_key'])) {
            return $miss;
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://napi.jibit.ir/ppg'), '/');
        if (! str_ends_with($base, '/v3')) {
            $base .= '/v3';
        }
        $token = $this->accessToken($config, $base);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت جیبیت ناموفق بود.'];
        }
        $response = Http::timeout(30)->withToken($token)->acceptJson()->asJson()->post($base.'/purchases', array_filter([
            'amount' => $amountRial,
            'currency' => 'RIALS',
            'callbackUrl' => $callbackUrl,
            'clientReferenceNumber' => (string) ($meta['order_id'] ?? ''),
            'description' => mb_substr($description, 0, 255),
            'userIdentifier' => $meta['mobile'] ?? null,
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $url = (string) data_get($response, 'pspSwitchingUrl', '');
        $purchaseId = (string) data_get($response, 'purchaseId', '');
        if ($url === '' || $purchaseId === '') {
            return ['ok' => false, 'message' => 'Jibit request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $purchaseId,
            'meta' => ['jibit_purchase_id' => $purchaseId, 'amount_rial' => $amountRial, 'provider_ref' => $purchaseId],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $purchaseId = (string) ($callback['purchaseId'] ?? $intentMeta['jibit_purchase_id'] ?? '');
        $status = strtoupper((string) ($callback['status'] ?? 'SUCCESSFUL'));
        if ($purchaseId === '' || ($status !== '' && $status !== 'SUCCESSFUL')) {
            return ['ok' => false, 'message' => 'پرداخت جیبیت ناموفق بود.'];
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://napi.jibit.ir/ppg'), '/');
        if (! str_ends_with($base, '/v3')) {
            $base .= '/v3';
        }
        $token = $this->accessToken($config, $base);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت جیبیت ناموفق بود.'];
        }
        $response = Http::timeout(30)->withToken($token)->acceptJson()->asJson()
            ->post($base.'/purchases/'.$purchaseId.'/verify', ['purchaseId' => $purchaseId])->json();
        if (strtoupper((string) data_get($response, 'status', '')) !== 'SUCCESSFUL') {
            return ['ok' => false, 'message' => 'تأیید جیبیت ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'pspReferenceNumber', $purchaseId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key', 'secret_key']) ?? ['ok' => true, 'message' => 'پیکربندی جیبیت کامل است.'];
    }

    /** @param  array<string, mixed>  $config */
    private function accessToken(array $config, string $base): ?string
    {
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/tokens', [
            'apiKey' => (string) $config['api_key'],
            'secretKey' => (string) $config['secret_key'],
        ])->json();
        $token = (string) data_get($response, 'accessToken', '');

        return $token !== '' ? $token : null;
    }
}
