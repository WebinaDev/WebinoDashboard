<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://docs.stripe.com/api/checkout/sessions */
class StripeDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string
    {
        return 'stripe';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['secret_key'])) {
            return $miss;
        }
        $currency = strtoupper((string) ($config['currency'] ?? 'USD'));
        $zeroDecimal = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
        $fx = $this->fxMinorAmount($config, $amountRial, $currency, in_array($currency, $zeroDecimal, true) ? 0 : 2);
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $success = $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'session_id={CHECKOUT_SESSION_ID}';
        $cancel = $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'stripe_status=cancel';
        $response = Http::timeout(30)
            ->withToken((string) $config['secret_key'])
            ->asForm()
            ->post('https://api.stripe.com/v1/checkout/sessions', [
                'mode' => 'payment',
                'success_url' => $success,
                'cancel_url' => $cancel,
                'client_reference_id' => (string) ($meta['order_id'] ?? ''),
                'line_items[0][price_data][currency]' => strtolower($fx['currency']),
                'line_items[0][price_data][product_data][name]' => mb_substr($description, 0, 120),
                'line_items[0][price_data][unit_amount]' => $fx['amount'],
                'line_items[0][quantity]' => 1,
            ])->json();
        $id = (string) data_get($response, 'id', '');
        $url = (string) data_get($response, 'url', '');
        if ($id === '' || $url === '') {
            return ['ok' => false, 'message' => 'Stripe request failed: '.(data_get($response, 'error.message') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $id,
            'meta' => [
                'stripe_session_id' => $id,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
                'provider_ref' => $id,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['stripe_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت Stripe لغو شد.'];
        }
        $sessionId = (string) ($intentMeta['stripe_session_id'] ?? '');
        $callbackSessionId = (string) ($callback['session_id'] ?? $sessionId);
        if ($sessionId === '' || ! hash_equals($sessionId, $callbackSessionId)
            || ! isset($intentMeta['amount_rial'], $intentMeta['fx_amount'], $intentMeta['fx_currency'])
            || (string) $intentMeta['amount_rial'] !== (string) $amountRial) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }
        $response = Http::timeout(30)
            ->withToken((string) ($config['secret_key'] ?? ''))
            ->get('https://api.stripe.com/v1/checkout/sessions/'.$sessionId)
            ->json();
        $paymentStatus = (string) data_get($response, 'payment_status', '');
        if ($paymentStatus !== 'paid') {
            return ['ok' => false, 'message' => 'تأیید Stripe ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        if ((string) data_get($response, 'id', '') !== $sessionId
            || (string) data_get($response, 'amount_total', '') !== (string) $intentMeta['fx_amount']
            || strtoupper((string) data_get($response, 'currency', '')) !== strtoupper((string) $intentMeta['fx_currency'])) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'payment_intent', $sessionId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['secret_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی Stripe کامل است.'];
    }
}
