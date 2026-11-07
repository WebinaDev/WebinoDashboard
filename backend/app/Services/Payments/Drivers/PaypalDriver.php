<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://developer.paypal.com/docs/api/orders/v2/ */
class PaypalDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string
    {
        return 'paypal';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['client_id', 'client_secret'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $token = $this->accessToken($config);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت PayPal ناموفق بود.'];
        }
        $value = number_format($fx['amount'] / 100, 2, '.', '');
        $response = Http::timeout(30)
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->post($this->apiBase($config).'/v2/checkout/orders', [
                'intent' => 'CAPTURE',
                'purchase_units' => [[
                    'reference_id' => (string) ($meta['order_id'] ?? ''),
                    'description' => mb_substr($description, 0, 120),
                    'amount' => [
                        'currency_code' => $fx['currency'],
                        'value' => $value,
                    ],
                ]],
                'application_context' => [
                    'return_url' => $callbackUrl,
                    'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'paypal_status=cancel',
                    'user_action' => 'PAY_NOW',
                ],
            ])->json();
        $id = (string) data_get($response, 'id', '');
        $approve = '';
        foreach ((array) data_get($response, 'links', []) as $link) {
            if (($link['rel'] ?? '') === 'approve') {
                $approve = (string) ($link['href'] ?? '');
                break;
            }
        }
        if ($id === '' || $approve === '') {
            return ['ok' => false, 'message' => 'PayPal request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $approve,
            'authority' => $id,
            'meta' => [
                'paypal_order_id' => $id,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
                'provider_ref' => $id,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['paypal_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت PayPal لغو شد.'];
        }
        $orderId = (string) ($callback['token'] ?? $callback['orderID'] ?? $intentMeta['paypal_order_id'] ?? '');
        if ($orderId === '') {
            return ['ok' => false, 'message' => 'شناسه سفارش PayPal یافت نشد.'];
        }
        $token = $this->accessToken($config);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت PayPal ناموفق بود.'];
        }
        $response = Http::timeout(30)
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->post($this->apiBase($config).'/v2/checkout/orders/'.$orderId.'/capture')
            ->json();
        $status = (string) data_get($response, 'status', '');
        if (! in_array($status, ['COMPLETED', 'APPROVED'], true)) {
            // Already captured returns COMPLETED via GET sometimes; try status on purchase unit.
            $puStatus = (string) data_get($response, 'purchase_units.0.payments.captures.0.status', '');
            if ($puStatus !== 'COMPLETED') {
                return ['ok' => false, 'message' => 'تأیید PayPal ناموفق بود.', 'meta' => is_array($response) ? $response : []];
            }
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'purchase_units.0.payments.captures.0.id', $orderId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['client_id', 'client_secret'])
            ?? ['ok' => true, 'message' => 'پیکربندی PayPal کامل است.'];
    }

    /** @param  array<string, mixed>  $config */
    private function apiBase(array $config): string
    {
        return ! empty($config['sandbox'])
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';
    }

    /** @param  array<string, mixed>  $config */
    private function accessToken(array $config): ?string
    {
        $response = Http::timeout(30)
            ->withBasicAuth((string) $config['client_id'], (string) $config['client_secret'])
            ->asForm()
            ->post($this->apiBase($config).'/v1/oauth2/token', ['grant_type' => 'client_credentials'])
            ->json();
        $token = (string) data_get($response, 'access_token', '');

        return $token !== '' ? $token : null;
    }
}
