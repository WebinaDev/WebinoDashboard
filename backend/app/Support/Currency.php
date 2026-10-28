<?php

namespace App\Support;

/**
 * Canonical Iranian currency → IRR (rial) factors (parity with the plugin's
 * Webino_Dashboard_Currency, wfcp/basalam 0.9.64): one shared truth for gateways,
 * marketplaces, SEO, SMS reports and accounting.
 */
final class Currency
{
    public const RIAL_FACTORS = [
        'IRR' => 1.0, 'IRT' => 10.0, 'TOMAN' => 10.0, 'IRHR' => 1000.0, 'IRHT' => 10000.0,
        'ریال' => 1.0, 'تومان' => 10.0,
    ];

    public static function rialFactor(?string $currency): float
    {
        $raw = trim((string) $currency);
        $code = strtoupper($raw === '' ? 'IRT' : $raw);

        return self::RIAL_FACTORS[$code] ?? self::RIAL_FACTORS[$raw] ?? 1.0;
    }

    public static function toRial(float|int $amount, ?string $currency): float
    {
        return (float) $amount * self::rialFactor($currency);
    }

    public static function toRialInt(float|int $amount, ?string $currency): int
    {
        return (int) round(self::toRial($amount, $currency));
    }

    public static function fromRial(float|int $rial, ?string $currency): float
    {
        $f = self::rialFactor($currency);

        return $f > 0 ? (float) $rial / $f : (float) $rial;
    }

    public static function toToman(float|int $amount, ?string $currency): float
    {
        return self::toRial($amount, $currency) / 10;
    }

    public static function isToman(?string $currency): bool
    {
        return in_array(strtoupper(trim((string) $currency)), ['IRT', 'TOMAN', 'IRHT'], true)
            || (bool) preg_match('/تومان|toman|irt/iu', (string) $currency);
    }
}
