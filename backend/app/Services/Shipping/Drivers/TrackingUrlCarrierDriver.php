<?php

namespace App\Services\Shipping\Drivers;

/**
 * Live tracking via public URL template (Iran Post and similar).
 */
class TrackingUrlCarrierDriver implements CarrierDriverInterface
{
    public function __construct(
        protected string $code,
        protected string $defaultTemplate = '',
    ) {}

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
        return [
            'ok' => false,
            'cost_minor' => null,
            'message' => 'نرخ‌گذاری از طریق مناطق ارسال یا تاپین انجام می‌شود.',
        ];
    }

    public function track(array $config, string $trackingCode, array $meta = []): array
    {
        $tpl = (string) ($config['tracking_url_template'] ?? '') ?: $this->defaultTemplate;
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
        $tpl = (string) ($config['tracking_url_template'] ?? '') ?: $this->defaultTemplate;
        if ($tpl === '' || ! str_contains($tpl, '{code}')) {
            return ['ok' => false, 'message' => 'قالب لینک رهگیری باید شامل {code} باشد.'];
        }

        return ['ok' => true, 'message' => 'لینک رهگیری آماده است.'];
    }
}
