<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;
use Brick\Math\BigDecimal;
use Brick\Math\Exception\MathException;

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
        $currency = strtoupper((string) ($config['currency'] ?? 'USD'));
        $zeroDecimal = in_array($currency, ['HUF', 'JPY', 'TWD'], true);
        $fx = $this->fxMinorAmount($config, $amountRial, $currency, $zeroDecimal ? 0 : 2);
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $token = $this->accessToken($config);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت PayPal ناموفق بود.'];
        }
        $value = $zeroDecimal ? (string) $fx['amount'] : $this->fxMajorAmount($fx['amount'], 2, $fx['currency']);
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
        $orderId = (string) ($intentMeta['paypal_order_id'] ?? '');
        $callbackOrderId = (string) ($callback['token'] ?? $callback['orderID'] ?? $orderId);
        if ($orderId === '' || ! hash_equals($orderId, $callbackOrderId)
            || ! isset($intentMeta['amount_rial'], $intentMeta['fx_amount'], $intentMeta['fx_currency'])
            || (string) $intentMeta['amount_rial'] !== (string) $amountRial) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
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
        $capture = data_get($response, 'purchase_units.0.payments.captures.0', []);
        if ($status !== 'COMPLETED' || data_get($capture, 'status') !== 'COMPLETED') {
            return ['ok' => false, 'message' => 'تأیید PayPal ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        try {
            $scale = in_array(strtoupper((string) $intentMeta['fx_currency']), ['IRR', 'IRT', 'HUF', 'JPY', 'TWD'], true) ? 1 : 100;
            $capturedAmount = BigDecimal::of((string) data_get($capture, 'amount.value', ''))->multipliedBy($scale)->toInt();
        } catch (MathException $exception) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }
        if ((string) data_get($response, 'id', '') !== $orderId
            || (string) $capturedAmount !== (string) $intentMeta['fx_amount']
            || strtoupper((string) data_get($capture, 'amount.currency_code', '')) !== strtoupper((string) $intentMeta['fx_currency'])) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
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
