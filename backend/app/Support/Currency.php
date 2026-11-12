<?php

namespace App\Support;

/**
 * Unified Iranian / display currency math.
 *
 * Store amounts (products, orders, plans, gift cards, shipping, coupons)
 * are in the store display currency (default IRT / toman). IRR is only the
 * settlement unit for gateways whose API requires rials — convert exactly
 * once with {@see toGatewayApiAmount()} / {@see toGatewayRial()}.
 *
 * Iranian fixed factors (parity with Dashboard + wfcp/basalam):
 *   IRR=1, IRT/تومان=10, IRHR=1000, IRHT/هزارتومان=10000
 * Foreign units need an FX rate (rial per 1 foreign unit).
 */
final class Currency
{
    public const BASE = 'IRR';

    public const SETTLEMENT = 'IRR';

    /** @var array<string, float> */
    public const RIAL_FACTORS = [
        'IRR' => 1.0,
        'IRT' => 10.0,
        'TOMAN' => 10.0,
        'IRHR' => 1000.0,
        'IRHT' => 10000.0,
        'ریال' => 1.0,
        'تومان' => 10.0,
        'هزارتومان' => 10000.0,
        'هزار تومان' => 10000.0,
    ];

    /** Display / store codes exposed in settings UI. */
    public const DISPLAY_CODES = ['IRR', 'IRT', 'IRHT', 'USD', 'EUR', 'GBP'];

    /** Iranian units convertible without FX. */
    public const IRANIAN_CODES = ['IRR', 'IRT', 'IRHR', 'IRHT', 'TOMAN'];

    /** Foreign units that need FX → IRR. */
    public const FOREIGN_CODES = ['USD', 'EUR', 'GBP'];

    /** @var array<string, array{fa:string,en:string,symbol:string,decimals:int}> */
    public const META = [
        'IRR' => ['fa' => 'ریال', 'en' => 'Rial', 'symbol' => '﷼', 'decimals' => 0],
        'IRT' => ['fa' => 'تومان', 'en' => 'Toman', 'symbol' => 'تومان', 'decimals' => 0],
        'IRHT' => ['fa' => 'هزار تومان', 'en' => 'Thousand Toman', 'symbol' => 'هزارتومان', 'decimals' => 0],
        'USD' => ['fa' => 'دلار', 'en' => 'US Dollar', 'symbol' => '$', 'decimals' => 2],
        'EUR' => ['fa' => 'یورو', 'en' => 'Euro', 'symbol' => '€', 'decimals' => 2],
        'GBP' => ['fa' => 'پوند', 'en' => 'Pound', 'symbol' => '£', 'decimals' => 2],
    ];

    public static function normalize(?string $currency, string $fallback = 'IRT'): string
    {
        $raw = trim((string) $currency);
        if ($raw === '') {
            return strtoupper($fallback);
        }
        $upper = strtoupper($raw);
        if (isset(self::RIAL_FACTORS[$upper]) || in_array($upper, self::DISPLAY_CODES, true)) {
            return $upper === 'TOMAN' ? 'IRT' : $upper;
        }
        if (isset(self::RIAL_FACTORS[$raw])) {
            $mapped = array_search(self::RIAL_FACTORS[$raw], array_intersect_key(self::RIAL_FACTORS, array_flip(self::DISPLAY_CODES)), true);

            return is_string($mapped) ? $mapped : $upper;
        }
        if (preg_match('/هزار\s*تومان|hezar|irht/iu', $raw)) {
            return 'IRHT';
        }
        if (preg_match('/تومان|toman|irt/iu', $raw)) {
            return 'IRT';
        }
        if (preg_match('/ریال|rial|irr/iu', $raw)) {
            return 'IRR';
        }

        return in_array($upper, self::DISPLAY_CODES, true) ? $upper : strtoupper($fallback);
    }

    public static function isIranian(?string $currency): bool
    {
        $code = self::normalize($currency, 'IRT');

        return in_array($code, self::IRANIAN_CODES, true) || isset(self::RIAL_FACTORS[$code]);
    }

    public static function isForeign(?string $currency): bool
    {
        return in_array(self::normalize($currency, 'USD'), self::FOREIGN_CODES, true);
    }

    public static function rialFactor(?string $currency): float
    {
        $code = self::normalize($currency, 'IRT');
        if (isset(self::RIAL_FACTORS[$code])) {
            return self::RIAL_FACTORS[$code];
        }
        $raw = trim((string) $currency);

        return self::RIAL_FACTORS[$raw] ?? 1.0;
    }

    /**
     * Convert an amount in $currency into IRR (rial). Foreign codes need $fxRialPerUnit
     * (how many rials one unit of foreign currency is worth).
     */
    public static function toRial(float|int $amount, ?string $currency, ?float $fxRialPerUnit = null): float
    {
        $code = self::normalize($currency, 'IRT');
        if (self::isForeign($code)) {
            $rate = $fxRialPerUnit;
            if ($rate === null || $rate <= 0) {
                throw new \InvalidArgumentException('missing_exchange_rate:'.$code.'→IRR');
            }

            return (float) $amount * $rate;
        }

        return (float) $amount * self::rialFactor($code);
    }

    public static function toRialInt(float|int $amount, ?string $currency, ?float $fxRialPerUnit = null): int
    {
        return (int) round(self::toRial($amount, $currency, $fxRialPerUnit));
    }

    public static function fromRial(float|int $rial, ?string $currency, ?float $fxRialPerUnit = null): float
    {
        $code = self::normalize($currency, 'IRT');
        if (self::isForeign($code)) {
            $rate = $fxRialPerUnit;
            if ($rate === null || $rate <= 0) {
                throw new \InvalidArgumentException('missing_exchange_rate:IRR→'.$code);
            }

            return $rate > 0 ? (float) $rial / $rate : (float) $rial;
        }
        $f = self::rialFactor($code);

        return $f > 0 ? (float) $rial / $f : (float) $rial;
    }

    public static function toToman(float|int $amount, ?string $currency, ?float $fxRialPerUnit = null): float
    {
        return self::toRial($amount, $currency, $fxRialPerUnit) / 10.0;
    }

    public static function isToman(?string $currency): bool
    {
        return in_array(self::normalize($currency, 'IRT'), ['IRT', 'TOMAN', 'IRHT'], true);
    }

    /**
     * Convert a store-currency amount into integer rials.
     * Null / empty $fromCurrency is treated as IRT (store default), never IRR.
     */
    public static function toGatewayRial(float|int $amount, ?string $fromCurrency, ?float $fxRialPerUnit = null): int
    {
        return max(0, self::toRialInt($amount, $fromCurrency ?? 'IRT', $fxRialPerUnit));
    }

    /**
     * Unit each Iranian (or dual) PSP API expects.
     * IRT_OR_IRR: send IRT when the store is toman-based so the PSP page stays in toman.
     *
     * @var array<string, 'IRR'|'IRT'|'IRT_OR_IRR'>
     */
    public const API_UNITS = [
        'zibal' => 'IRR',
        'idpay' => 'IRR',
        'payir' => 'IRR',
        'sadad' => 'IRR',
        'mellat' => 'IRR',
        'saman' => 'IRR',
        'parsian' => 'IRR',
        'pasargad' => 'IRR',
        'irankish' => 'IRR',
        'sepehr' => 'IRR',
        'saderat' => 'IRR',
        'samankish' => 'IRR',
        'omidpay' => 'IRR',
        'paystar' => 'IRR',
        'vandar' => 'IRR',
        'shepa' => 'IRR',
        'payfa' => 'IRR',
        'zarinplus' => 'IRR',
        'jibit' => 'IRR',
        'tara' => 'IRR',
        'toman' => 'IRR',
        'digipay' => 'IRR',
        'snapppay' => 'IRR',
        'torobpay' => 'IRR',
        'bale_pay' => 'IRR',
        'asanpardakht' => 'IRR',
        'nextpay' => 'IRT',
        'payping' => 'IRT',
        'aghayepardakht' => 'IRT',
        'bitpay' => 'IRT',
        'easypay' => 'IRT',
        'parspal' => 'IRT',
        'iran_wallet' => 'IRT',
        'zarinpal' => 'IRT_OR_IRR',
    ];

    /** API unit for $provider: IRR or IRT. Dual gateways follow the store currency. */
    public static function apiUnitFor(string $provider, ?string $storeCurrency = 'IRT'): string
    {
        $unit = self::API_UNITS[str_replace('-', '_', strtolower($provider))] ?? 'IRR';
        if ($unit === 'IRT_OR_IRR') {
            return self::isToman($storeCurrency) ? 'IRT' : 'IRR';
        }

        return $unit;
    }

    /** Convert already-settled rials into the unit a gateway API wants. */
    public static function fromRialToGateway(int $rial, string $gatewayUnit): int
    {
        $unit = strtoupper($gatewayUnit);
        if (in_array($unit, ['IRT', 'TOMAN'], true)) {
            return max(0, (int) round($rial / 10));
        }

        return max(0, $rial);
    }

    /**
     * Convert $amount in $fromCurrency into $toCurrency (Iranian units, or FX when given).
     */
    public static function convert(float|int $amount, ?string $fromCurrency, ?string $toCurrency, ?float $fxRialPerUnit = null): int
    {
        $from = self::normalize($fromCurrency ?? 'IRT', 'IRT');
        $to = self::normalize($toCurrency ?? 'IRT', 'IRT');
        if ($from === $to) {
            return (int) round((float) $amount);
        }

        return (int) round(self::fromRial(self::toRial($amount, $from, $fxRialPerUnit), $to, $fxRialPerUnit));
    }

    /**
     * Convert an amount in $amountCurrency to the unit $provider's API expects.
     * Dual gateways (Zarinpal) follow $storeCurrency so the PSP page stays in toman
     * on IRT stores even when the row itself is stamped IRR.
     */
    public static function toGatewayApiAmount(float|int $amount, ?string $amountCurrency, string $provider, ?string $storeCurrency = null, ?float $fxRialPerUnit = null): int
    {
        $rial = self::toGatewayRial($amount, $amountCurrency, $fxRialPerUnit);
        $unit = self::apiUnitFor($provider, $storeCurrency ?? $amountCurrency);

        return self::fromRialToGateway($rial, $unit);
    }

    public static function label(?string $currency, string $locale = 'fa'): string
    {
        $code = self::normalize($currency, 'IRT');
        $meta = self::META[$code] ?? null;
        if ($meta === null) {
            return $code;
        }

        return str_starts_with(strtolower($locale), 'en') ? $meta['en'] : $meta['fa'];
    }

    public static function symbol(?string $currency): string
    {
        $code = self::normalize($currency, 'IRT');

        return self::META[$code]['symbol'] ?? $code;
    }

    public static function decimals(?string $currency): int
    {
        $code = self::normalize($currency, 'IRT');

        return self::META[$code]['decimals'] ?? 0;
    }
}
