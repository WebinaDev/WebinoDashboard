<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://developer.coingate.com/docs/create-order */
class CoingateDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string
    {
        return 'coingate';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_token'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $price = $this->fxMajorAmount($fx['amount'], 2, $fx['currency']);
        $base = ! empty($config['sandbox']) ? 'https://api-sandbox.coingate.com' : 'https://api.coingate.com';
        $response = Http::timeout(30)
            ->withToken((string) $config['api_token'], 'Token')
            ->acceptJson()
            ->asJson()
            ->post($base.'/v2/orders', [
                'order_id' => (string) ($meta['order_id'] ?? ''),
                'price_amount' => $price,
                'price_currency' => $fx['currency'],
                'receive_currency' => $fx['currency'],
                'title' => mb_substr($description, 0, 100),
                'description' => mb_substr($description, 0, 255),
                'callback_url' => $this->webhookUrl($callbackUrl),
                'success_url' => $callbackUrl,
                'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'coingate_status=cancel',
            ])->json();
        $id = (string) data_get($response, 'id', '');
        $url = (string) data_get($response, 'payment_url', '');
        if ($id === '' || $url === '') {
            return ['ok' => false, 'message' => 'CoinGate request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $id,
            'meta' => [
                'coingate_id' => $id,
                'provider_ref' => $id,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['coingate_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت CoinGate لغو شد.'];
        }
        $id = (string) ($intentMeta['coingate_id'] ?? '');
        $callbackId = (string) ($callback['id'] ?? $id);
        if ($id === '' || ! hash_equals($id, $callbackId)
            || ! isset($intentMeta['amount_rial'])
            || (string) $intentMeta['amount_rial'] !== (string) $amountRial) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }
        $base = ! empty($config['sandbox']) ? 'https://api-sandbox.coingate.com' : 'https://api.coingate.com';
        $response = Http::timeout(30)
            ->withToken((string) ($config['api_token'] ?? ''), 'Token')
            ->get($base.'/v2/orders/'.$id)
            ->json();
        $paymentStatus = strtolower((string) data_get($response, 'status', ''));
        if (! in_array($paymentStatus, ['paid', 'confirmed'], true)) {
            return ['ok' => false, 'message' => 'تأیید CoinGate هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
        }
        if ((string) data_get($response, 'id', '') !== $id
            || ! $this->fxResponseMatches(data_get($response, 'price_amount'), data_get($response, 'price_currency'), $intentMeta)) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'id', $id),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_token'])
            ?? ['ok' => true, 'message' => 'پیکربندی CoinGate کامل است.'];
    }

    private function webhookUrl(string $callbackUrl): string
    {
        if (preg_match('#^(https?://[^/]+)#i', $callbackUrl, $m)) {
            return $m[1].'/api/v1/payments/webhook/coingate';
        }

        return $callbackUrl;
    }
}
