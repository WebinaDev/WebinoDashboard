<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;

/** @see https://www.coinpayments.net/apidoc-create-transaction */
class CoinpaymentsDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string { return 'coinpayments'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['public_key', 'private_key', 'merchant_id'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config + ['currency' => $config['currency'] ?? 'USD'], $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            // allow rial_per_unit missing only if currency IRR
            return $fx;
        }
        $amount = number_format($fx['amount'] / 100, 8, '.', '');
        $ipn = preg_replace('#/callback/.*$#', '/webhook/coinpayments', $callbackUrl) ?: $callbackUrl;
        $params = [
            'version' => 1,
            'cmd' => 'create_transaction',
            'key' => (string) $config['public_key'],
            'amount' => $amount,
            'currency1' => $fx['currency'],
            'currency2' => (string) ($config['pay_currency'] ?? $fx['currency']),
            'buyer_email' => (string) ($meta['email'] ?? 'buyer@example.com'),
            'item_name' => mb_substr($description, 0, 120),
            'invoice' => (string) ($meta['order_id'] ?? ''),
            'ipn_url' => $ipn,
            'success_url' => $callbackUrl,
            'cancel_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'coinpayments_status=cancel',
            'format' => 'json',
        ];
        $response = $this->api($config, $params);
        $txn = (string) data_get($response, 'result.txn_id', '');
        $url = (string) data_get($response, 'result.status_url', data_get($response, 'result.checkout_url', ''));
        if ((int) data_get($response, 'error', 'ok') !== 0 && data_get($response, 'error') !== 'ok' && $txn === '') {
            return ['ok' => false, 'message' => 'CoinPayments request failed: '.(data_get($response, 'error') ?? json_encode($response))];
        }
        if ($txn === '' || $url === '') {
            return ['ok' => false, 'message' => 'CoinPayments txn/url missing: '.json_encode($response)];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $txn,
            'meta' => [
                'coinpayments_txn_id' => $txn,
                'provider_ref' => $txn,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['coinpayments_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت CoinPayments لغو شد.'];
        }
        $txn = (string) ($callback['txn_id'] ?? $intentMeta['coinpayments_txn_id'] ?? '');
        // IPN shortcut only when HMAC over the raw body validates.
        $status = (int) ($callback['status'] ?? -1);
        if ($status >= 100 && $txn !== '' && $this->validIpn($config, $callback)) {
            return ['ok' => true, 'message' => 'verified', 'ref_id' => $txn, 'meta' => $callback];
        }
        if ($txn === '') {
            return ['ok' => false, 'message' => 'شناسه تراکنش CoinPayments یافت نشد.'];
        }
        $response = $this->api($config, [
            'version' => 1,
            'cmd' => 'get_tx_info',
            'key' => (string) ($config['public_key'] ?? ''),
            'txid' => $txn,
            'format' => 'json',
        ]);
        $txStatus = (int) data_get($response, 'result.status', -1);
        if ($txStatus < 100) {
            return ['ok' => false, 'message' => 'تأیید CoinPayments هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $txn,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['public_key', 'private_key', 'merchant_id'])
            ?? ['ok' => true, 'message' => 'پیکربندی CoinPayments کامل است.'];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $params */
    private function api(array $config, array $params): array
    {
        $body = http_build_query($params);
        $hmac = hash_hmac('sha512', $body, (string) ($config['private_key'] ?? ''));
        $response = Http::timeout(40)
            ->withHeaders(['HMAC' => $hmac])
            ->withBody($body, 'application/x-www-form-urlencoded')
            ->post('https://www.coinpayments.net/api.php')
            ->json();

        return is_array($response) ? $response : [];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $callback */
    private function validIpn(array $config, array $callback): bool
    {
        $secret = (string) ($config['ipn_secret'] ?? '');
        $hmac = (string) ($callback['_hmac'] ?? '');
        $raw = (string) ($callback['_raw_body'] ?? '');
        if ($secret === '' || $hmac === '' || $raw === '') {
            return false;
        }
        $merchant = (string) ($callback['merchant'] ?? '');
        if ($merchant !== '' && $merchant !== (string) ($config['merchant_id'] ?? '')) {
            return false;
        }
        $expected = hash_hmac('sha512', $raw, $secret);

        return hash_equals($expected, $hmac);
    }
}
