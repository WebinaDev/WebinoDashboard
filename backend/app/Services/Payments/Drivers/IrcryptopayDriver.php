<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://ircryptopay.online/ + WooCommerce ircrypto-for-woocommerce */
class IrcryptopayDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string { return 'ircryptopay'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $currency = strtoupper((string) ($config['currency'] ?? 'IRR'));
        if (in_array($currency, ['IRR', 'IRT'], true)) {
            if ($amountRial <= 0) {
                return ['ok' => false, 'message' => __('api.payment_amount_must_be_positive')];
            }
            $currency = 'IRR';
            $amount = $amountRial.'.00';
        } else {
            $fx = $this->fxMinorAmount($config, $amountRial, $currency);
            if (! ($fx['ok'] ?? false)) {
                return $fx;
            }
            $amount = $this->fxMajorAmount($fx['amount'], 2, $fx['currency']);
        }
        $payload = array_filter([
            'amount_mode' => 'fixed',
            'amount' => $amount,
            'price_currency' => $currency,
            'external_ref' => (string) ($meta['order_id'] ?? ''),
            'success_url' => $callbackUrl,
            'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'ircrypto_status=cancel',
            'description' => mb_substr($description, 0, 255),
            'settle_address' => $config['settle_address'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');
        $response = Http::timeout(40)
            ->withToken((string) $config['api_key'])
            ->acceptJson()->asJson()
            ->post('https://api.ircryptopay.online/v1/invoices', $payload)
            ->json();
        $id = (string) data_get($response, 'id', data_get($response, 'invoice_id', data_get($response, 'data.id', '')));
        $url = (string) data_get($response, 'payment_url', data_get($response, 'checkout_url', data_get($response, 'data.payment_url', '')));
        if ($id === '' || $url === '') {
            return ['ok' => false, 'message' => 'IRCrypto Pay request failed: '.json_encode($response)];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $id,
            'meta' => [
                'ircryptopay_id' => $id,
                'provider_ref' => $id,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['ircrypto_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت IRCrypto لغو شد.'];
        }
        $id = (string) ($intentMeta['ircryptopay_id'] ?? '');
        $callbackId = (string) ($callback['id'] ?? $callback['invoice_id'] ?? $id);
        if ($id === '' || ! hash_equals($id, $callbackId)
            || ! isset($intentMeta['amount_rial'])
            || (string) $intentMeta['amount_rial'] !== (string) $amountRial) {
            return ['ok' => false, 'message' => __('api.payment_amount_mismatch')];
        }
        $status = strtolower((string) ($callback['status'] ?? $callback['payment_status'] ?? ''));
        if (in_array($status, ['paid', 'completed', 'confirmed', 'settled'], true) && $id !== '') {
            if (! $this->validWebhook($config, $callback)) {
                return ['ok' => false, 'message' => 'امضای وب‌هوک IRCrypto نامعتبر است.'];
            }

            return ['ok' => true, 'message' => 'verified', 'ref_id' => $id, 'meta' => $callback];
        }
        $response = Http::timeout(30)
            ->withToken((string) ($config['api_key'] ?? ''))
            ->get('https://api.ircryptopay.online/v1/invoices/'.$id)
            ->json();
        $paymentStatus = strtolower((string) data_get($response, 'status', data_get($response, 'data.status', '')));
        if (! in_array($paymentStatus, ['paid', 'completed', 'confirmed', 'settled'], true)) {
            return ['ok' => false, 'message' => 'تأیید IRCrypto هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
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
        return $this->missingRequired($config, ['api_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی IRCrypto Pay کامل است.'];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $callback */
    private function validWebhook(array $config, array $callback): bool
    {
        $secret = (string) ($config['webhook_secret'] ?? '');
        $sign = (string) ($callback['signature'] ?? $callback['sign'] ?? '');
        // Webhook path must present a signature when a secret is configured;
        // if neither is set, reject status-only claims and force API poll.
        if ($secret === '' || $sign === '') {
            return false;
        }
        $payload = $callback;
        unset($payload['signature'], $payload['sign'], $payload['_raw_body'], $payload['_hmac']);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $expected = hash_hmac('sha256', (string) $body, $secret);

        return hash_equals($expected, $sign) || hash_equals('sha256='.$expected, $sign);
    }
}
