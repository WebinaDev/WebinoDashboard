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
        $price = number_format($fx['amount'] / 100, 2, '.', '');
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
        $id = (string) ($callback['id'] ?? $callback['order_id'] ?? $intentMeta['coingate_id'] ?? '');
        $status = strtolower((string) ($callback['status'] ?? ''));
        if (in_array($status, ['paid', 'confirmed'], true) && $id !== '') {
            return ['ok' => true, 'message' => 'verified', 'ref_id' => $id, 'meta' => $callback];
        }
        if ($id === '') {
            return ['ok' => false, 'message' => 'شناسه سفارش CoinGate یافت نشد.'];
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
