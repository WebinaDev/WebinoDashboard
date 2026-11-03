<?php

namespace App\Support;

/**
 * Unified Iranian / display currency math.
 *
 * Canonical storage for ERP shop & payment settlement: integer IRR (rial).
 * Display unit is chosen in settings (IRT/IRR/IRHT/USD/EUR/GBP) and must
 * never be sent blindly to Iranian PSPs — use {@see toGatewayRial()}.
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
     * Amount Iranian PSPs expect (Zarinpal/IDPay/Digipay/SnappPay docs: IRR rials).
     * Always returns integer rials ≥ 1 when $amount > 0.
     */
    public static function toGatewayRial(float|int $amount, ?string $fromCurrency, ?float $fxRialPerUnit = null): int
    {
        return max(0, self::toRialInt($amount, $fromCurrency ?? self::BASE, $fxRialPerUnit));
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
