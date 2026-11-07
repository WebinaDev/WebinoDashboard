<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Iran Wallet / Walleta CPG (کیف پول ایران).
 * @see shetabit/anypay Walleta driver — cpg.walleta.ir
 */
class IranWalletDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'iran_wallet'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['merchant_id'])) {
            return $miss;
        }
        $amountToman = max(1, (int) round($amountRial / 10));
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://cpg.walleta.ir/payment/request.json', [
            'merchant_code' => (string) $config['merchant_id'],
            'invoice_reference' => (string) ($meta['order_id'] ?? uniqid('iw_', true)),
            'invoice_date' => date('Y-m-d H:i:s'),
            'invoice_amount' => $amountToman,
            'payer_first_name' => (string) ($meta['name'] ?? 'Customer'),
            'payer_last_name' => '.',
            'payer_national_code' => (string) ($config['national_code'] ?? '0000000000'),
            'payer_mobile' => (string) ($meta['mobile'] ?? '09000000000'),
            'callback_url' => $callbackUrl,
            'items' => [[
                'reference' => (string) ($meta['order_id'] ?? '1'),
                'name' => mb_substr($description, 0, 80),
                'quantity' => 1,
                'unit_price' => $amountToman,
                'unit_discount' => 0,
                'unit_tax_amount' => 0,
                'total_amount' => $amountToman,
            ]],
        ]);
        $body = $response->json();
        $token = (string) data_get($body, 'token', data_get($body, 'content.token', ''));
        if (! $response->successful() || $token === '') {
            return ['ok' => false, 'message' => 'Iran Wallet request failed: '.($response->body())];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://cpg.walleta.ir/panel/payment-gateway/'.$token,
            'authority' => $token,
            'meta' => [
                'iran_wallet_token' => $token,
                'invoice_reference' => (string) ($meta['order_id'] ?? ''),
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $token = (string) ($callback['token'] ?? $intentMeta['iran_wallet_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن کیف‌پول ایران یافت نشد.'];
        }
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://cpg.walleta.ir/payment/verify.json', [
            'merchant_code' => (string) ($config['merchant_id'] ?? ''),
            'token' => $token,
            'invoice_reference' => (string) ($intentMeta['invoice_reference'] ?? ''),
            'invoice_amount' => $amountToman,
        ]);
        $body = $response->json() ?: [];
        $status = strtolower((string) data_get($body, 'status', data_get($body, 'content.status', '')));
        $ok = $response->successful() && (
            filter_var(data_get($body, 'success', data_get($body, 'ok')), FILTER_VALIDATE_BOOLEAN)
            || in_array($status, ['ok', 'success', 'paid', 'verified', '1'], true)
            || (int) data_get($body, 'code', data_get($body, 'status_code', 0)) === 200
            || filled(data_get($body, 'content.paid_at'))
            || filled(data_get($body, 'paid_at'))
        );
        if (! $ok) {
            return ['ok' => false, 'message' => 'تأیید کیف‌پول ایران ناموفق بود.', 'meta' => $body];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($body, 'content.invoice_reference', data_get($body, 'invoice_reference', $token)),
            'meta' => $body,
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['merchant_id'])
            ?? ['ok' => true, 'message' => 'پیکربندی کیف‌پول ایران کامل است.'];
    }
}
