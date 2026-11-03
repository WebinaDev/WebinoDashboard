<?php

namespace App\Services\Shipping\Drivers;

/**
 * Store-local courier / freight: base + per-kg or flat city cost; optional tracking URL.
 */
class LocalRateCarrierDriver implements CarrierDriverInterface
{
    public function __construct(protected string $code) {}

    public function code(): string
    {
        return $this->code;
    }

    public function status(): string
    {
        return 'live';
    }

    public function quote(array $config, array $context): array
    {
        $weightKg = max(0, (int) ($context['weight_g'] ?? 0)) / 1000;
        $base = max(0, (int) ($config['base_cost'] ?? 0));
        $perKg = max(0, (int) ($config['per_kg'] ?? 0));
        $cost = $base + (int) round($perKg * $weightKg);
        $city = trim((string) ($context['city'] ?? ''));
        $norm = static fn ($v) => trim(str_replace(['ي', 'ك', '‌'], ['ی', 'ک', ' '], mb_strtolower((string) $v)));
        foreach ((array) ($config['city_rates'] ?? []) as $row) {
            if (! is_array($row)) {
                continue;
            }
            if ($city !== '' && $norm($row['city'] ?? '') === $norm($city)) {
                $cost = max(0, (int) ($row['cost'] ?? $cost));
                break;
            }
        }

        return ['ok' => true, 'cost_minor' => $cost];
    }

    public function track(array $config, string $trackingCode, array $meta = []): array
    {
        $tpl = (string) ($config['tracking_url_template'] ?? '');
        $url = $tpl !== '' && $trackingCode !== ''
            ? str_replace(['{code}', '{CODE}'], [urlencode($trackingCode), urlencode($trackingCode)], $tpl)
            : null;

        return [
            'carrier' => $this->code,
            'status' => $trackingCode !== '' ? (string) ($meta['shipping_status'] ?? 'in_transit') : null,
            'events' => [],
            'tracking_url' => $url,
        ];
    }

    public function testConnection(array $config): array
    {
        return ['ok' => true, 'message' => 'نرخ محلی فعال است (بدون API خارجی).'];
    }
}
