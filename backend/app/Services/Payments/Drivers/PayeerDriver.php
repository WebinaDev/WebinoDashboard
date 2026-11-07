<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;

/** @see https://payeer.com/en/merchant/ */
class PayeerDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string { return 'payeer'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['merchant_id', 'secret_key'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config, $amountRial, (string) ($config['currency'] ?? 'USD'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $orderId = (string) ($meta['order_id'] ?? uniqid('pr_', true));
        $amount = number_format($fx['amount'] / 100, 2, '.', '');
        $desc = base64_encode(mb_substr($description, 0, 100));
        $sign = strtoupper(hash('sha256', implode(':', [
            (string) $config['merchant_id'],
            $orderId,
            $amount,
            $fx['currency'],
            $desc,
            (string) $config['secret_key'],
        ])));
        $bridge = $this->formBridgeMeta('https://payeer.com/merchant/', [
            'm_shop' => (string) $config['merchant_id'],
            'm_orderid' => $orderId,
            'm_amount' => $amount,
            'm_curr' => $fx['currency'],
            'm_desc' => $desc,
            'm_sign' => $sign,
            'm_process' => 'send',
            'success_url' => $callbackUrl,
            'fail_url' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'payeer_status=cancel',
            'status_url' => preg_replace('#/callback/.*$#', '/webhook/payeer', $callbackUrl) ?: $callbackUrl,
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $orderId,
            'meta' => array_merge($bridge, [
                'payeer_order_id' => $orderId,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
                'provider_ref' => $orderId,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['payeer_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت پی‌یر لغو شد.'];
        }
        $mStatus = strtoupper((string) ($callback['m_status'] ?? ''));
        if ($mStatus !== '' && $mStatus !== 'SUCCESS') {
            return ['ok' => false, 'message' => 'پرداخت پی‌یر ناموفق بود.'];
        }
        $signParams = [
            (string) ($callback['m_operation_id'] ?? ''),
            (string) ($callback['m_operation_ps'] ?? ''),
            (string) ($callback['m_operation_date'] ?? ''),
            (string) ($callback['m_operation_pay_date'] ?? ''),
            (string) ($callback['m_shop'] ?? ''),
            (string) ($callback['m_orderid'] ?? ''),
            (string) ($callback['m_amount'] ?? ''),
            (string) ($callback['m_curr'] ?? ''),
            (string) ($callback['m_desc'] ?? ''),
            (string) ($callback['m_status'] ?? ''),
            (string) ($config['secret_key'] ?? ''),
        ];
        if (($callback['m_sign'] ?? '') !== '') {
            $expected = strtoupper(hash('sha256', implode(':', $signParams)));
            if (! hash_equals($expected, strtoupper((string) $callback['m_sign']))) {
                return ['ok' => false, 'message' => 'امضای پی‌یر نامعتبر است.'];
            }
        } elseif ($mStatus === '') {
            // Browser return without IPN fields — accept when order id matches intent.
            $orderId = (string) ($callback['m_orderid'] ?? $intentMeta['payeer_order_id'] ?? '');
            if ($orderId === '' || $orderId !== (string) ($intentMeta['payeer_order_id'] ?? $orderId)) {
                return ['ok' => false, 'message' => 'بازگشت پی‌یر بدون داده تأیید کافی نیست.'];
            }
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) ($callback['m_operation_id'] ?? $callback['m_orderid'] ?? $intentMeta['payeer_order_id'] ?? ''),
            'meta' => $callback,
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['merchant_id', 'secret_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی پی‌یر کامل است.'];
    }
}
