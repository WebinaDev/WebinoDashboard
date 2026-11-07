<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;

/** @see https://perfectmoney.com/api.html SCI */
class PerfectMoneyDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string { return 'perfect_money'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['payee_account', 'passphrase'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $paymentId = (string) ($meta['order_id'] ?? uniqid('pm_', true));
        $amount = number_format($fx['amount'] / 100, 2, '.', '');
        $bridge = $this->formBridgeMeta('https://perfectmoney.com/api/step1.asp', [
            'PAYEE_ACCOUNT' => (string) $config['payee_account'],
            'PAYEE_NAME' => (string) ($config['title'] ?? 'Merchant'),
            'PAYMENT_AMOUNT' => $amount,
            'PAYMENT_UNITS' => $fx['currency'],
            'PAYMENT_ID' => $paymentId,
            'STATUS_URL' => preg_replace('#/callback/.*$#', '/webhook/perfect_money', $callbackUrl) ?: $callbackUrl,
            'PAYMENT_URL' => $callbackUrl,
            'PAYMENT_URL_METHOD' => 'GET',
            'NOPAYMENT_URL' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'pm_status=cancel',
            'NOPAYMENT_URL_METHOD' => 'GET',
            'SUGGESTED_MEMO' => mb_substr($description, 0, 100),
            'BAGGAGE_FIELDS' => '',
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $paymentId,
            'meta' => array_merge($bridge, [
                'perfect_money_payment_id' => $paymentId,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
                'provider_ref' => $paymentId,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['pm_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت پرفکت‌مانی لغو شد.'];
        }
        $passphrase = strtoupper(md5((string) ($config['alternate_passphrase'] ?? $config['passphrase'] ?? '')));
        $fields = [
            (string) ($callback['PAYMENT_ID'] ?? ''),
            (string) ($callback['PAYEE_ACCOUNT'] ?? ''),
            (string) ($callback['PAYMENT_AMOUNT'] ?? ''),
            (string) ($callback['PAYMENT_UNITS'] ?? ''),
            (string) ($callback['PAYMENT_BATCH_NUM'] ?? ''),
            (string) ($callback['PAYER_ACCOUNT'] ?? ''),
            $passphrase,
            (string) ($callback['TIMESTAMPGMT'] ?? ''),
        ];
        $hash = strtoupper(md5(implode(':', $fields)));
        $v2 = strtoupper((string) ($callback['V2_HASH'] ?? ''));
        if ($v2 === '' || ! hash_equals($hash, $v2)) {
            return ['ok' => false, 'message' => 'امضای پرفکت‌مانی نامعتبر است.'];
        }
        $payee = (string) ($callback['PAYEE_ACCOUNT'] ?? '');
        if ($payee !== '' && $payee !== (string) ($config['payee_account'] ?? '')) {
            return ['ok' => false, 'message' => 'حساب پذیرنده پرفکت‌مانی هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) ($callback['PAYMENT_BATCH_NUM'] ?? $callback['PAYMENT_ID'] ?? ''),
            'meta' => $callback,
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['payee_account', 'passphrase'])
            ?? ['ok' => true, 'message' => 'پیکربندی پرفکت‌مانی کامل است.'];
    }
}
