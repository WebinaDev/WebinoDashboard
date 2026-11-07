<?php

namespace App\Services\Payments\Drivers\Concerns;

trait ConvertsFxAmount
{
    /**
     * Convert store amount (rial) to gateway minor units for FX/crypto.
     *
     * @param  array<string, mixed>  $config
     * @return array{ok: true, amount: int, currency: string}|array{ok: false, message: string}
     */
    protected function fxMinorAmount(array $config, int $amountRial, string $defaultCurrency = 'USD'): array
    {
        $currency = strtoupper((string) ($config['currency'] ?? $defaultCurrency));
        if ($currency === 'IRR') {
            return ['ok' => true, 'amount' => max(1, $amountRial), 'currency' => 'IRR'];
        }
        if ($currency === 'IRT') {
            return ['ok' => true, 'amount' => max(1, (int) round($amountRial / 10)), 'currency' => 'IRT'];
        }
        $rate = (float) ($config['rial_per_unit'] ?? 0);
        if ($rate <= 0) {
            return [
                'ok' => false,
                'message' => 'برای ارز '.$currency.' باید فیلد rial_per_unit (ریال به ازای هر واحد ارز) تنظیم شود.',
            ];
        }
        // Stripe/PayPal minor units (cents). Crypto gateways often use major units — callers may divide.
        $major = $amountRial / $rate;
        $minor = (int) max(1, round($major * 100));

        return ['ok' => true, 'amount' => $minor, 'currency' => $currency];
    }
}
