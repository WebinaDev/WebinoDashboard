<?php

namespace App\Services\Payments\Drivers\Concerns;

use Brick\Math\BigDecimal;
use Brick\Math\Exception\MathException;

trait ConvertsFxAmount
{
    /**
     * Convert store amount (rial) to gateway minor units for FX/crypto.
     *
     * @param  array<string, mixed>  $config
     * @return array{ok: true, amount: int, currency: string}|array{ok: false, message: string}
     */
    protected function fxMinorAmount(array $config, int $amountRial, string $defaultCurrency = 'USD', int $precision = 2): array
    {
        if ($amountRial <= 0) {
            return ['ok' => false, 'message' => __('api.payment_amount_must_be_positive')];
        }

        $currency = strtoupper((string) ($config['currency'] ?? $defaultCurrency));
        if ($currency === 'IRR') {
            return ['ok' => true, 'amount' => $amountRial, 'currency' => 'IRR'];
        }
        if ($currency === 'IRT') {
            if ($amountRial % 10 !== 0) {
                return ['ok' => false, 'message' => __('api.payment_amount_not_representable')];
            }

            return ['ok' => true, 'amount' => intdiv($amountRial, 10), 'currency' => 'IRT'];
        }
        $rateValue = $config['rial_per_unit'] ?? null;
        $rateText = is_int($rateValue) || is_float($rateValue) || is_string($rateValue) ? (string) $rateValue : '';
        try {
            $rate = strlen($rateText) <= 64 && preg_match('/^\d+(?:\.\d+)?$/D', $rateText)
                ? BigDecimal::of($rateText)
                : null;
        } catch (MathException $exception) {
            $rate = null;
        }

        if ($rate === null || ! $rate->isPositive()) {
            return [
                'ok' => false,
                'message' => __('api.payment_exchange_rate_required', ['currency' => $currency]),
            ];
        }
        try {
            $minor = BigDecimal::of($amountRial)->multipliedBy(10 ** $precision)->dividedBy($rate, 0)->toInt();
        } catch (MathException $exception) {
            return ['ok' => false, 'message' => __('api.payment_foreign_amount_not_representable')];
        }

        return ['ok' => true, 'amount' => $minor, 'currency' => $currency];
    }

    protected function fxMajorAmount(int $minor, int $precision = 2, string $currency = ''): string
    {
        if (in_array($currency, ['IRR', 'IRT'], true)) {
            return $minor.'.'.str_repeat('0', $precision);
        }

        return intdiv($minor, 100).'.'.str_pad((string) ($minor % 100), 2, '0', STR_PAD_LEFT).str_repeat('0', $precision - 2);
    }

    protected function fxResponseMatches(mixed $amount, mixed $currency, array $intentMeta): bool
    {
        $expectedAmount = $intentMeta['fx_amount'] ?? null;
        $expectedCurrency = $intentMeta['fx_currency'] ?? null;
        if ((! is_int($expectedAmount) && ! is_string($expectedAmount))
            || ! ctype_digit((string) $expectedAmount)
            || (string) (int) $expectedAmount !== (string) $expectedAmount
            || (int) $expectedAmount <= 0
            || ! is_string($expectedCurrency)
            || ! is_string($currency)
            || strtoupper($currency) !== strtoupper($expectedCurrency)
            || (! is_int($amount) && ! is_float($amount) && ! is_string($amount))) {
            return false;
        }

        try {
            return BigDecimal::of((string) $amount)->isEqualTo($this->fxMajorAmount((int) $expectedAmount, 2, strtoupper($expectedCurrency)));
        } catch (MathException $exception) {
            return false;
        }
    }
}
