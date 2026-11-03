<?php

namespace App\Services\Shipping\Drivers;

/**
 * Connect-ready stub: stores credentials, refuses live quote/create until official API lands.
 * Tracking falls back to tracking_url_template when present.
 */
class ScaffoldCarrierDriver implements CarrierDriverInterface
{
    /**
     * @param  list<string>  $required
     */
    public function __construct(
        protected string $code,
        protected array $required = [],
        protected ?string $docsUrl = null,
    ) {}

    public function code(): string
    {
        return $this->code;
    }

    public function status(): string
    {
        return 'scaffold';
    }

    public function quote(array $config, array $context): array
    {
        return [
            'ok' => false,
            'cost_minor' => null,
            'message' => 'این سرویس ارسال به‌زودی فعال می‌شود. زیرساخت تنظیمات آماده است.',
        ];
    }

    public function track(array $config, string $trackingCode, array $meta = []): array
    {
        $tpl = (string) ($config['tracking_url_template'] ?? '');
        $url = $tpl !== '' && $trackingCode !== ''
            ? str_replace(['{code}', '{CODE}'], [urlencode($trackingCode), urlencode($trackingCode)], $tpl)
            : null;

        return [
            'carrier' => $this->code,
            'status' => $trackingCode !== '' ? 'in_transit' : null,
            'events' => [],
            'tracking_url' => $url,
        ];
    }

    public function testConnection(array $config): array
    {
        $missing = [];
        foreach ($this->required as $key) {
            if (! filled($config[$key] ?? null)) {
                $missing[] = $key;
            }
        }
        if ($missing !== []) {
            return [
                'ok' => false,
                'message' => 'فیلدهای الزامی ناقص: '.implode(', ', $missing),
            ];
        }

        $hint = $this->docsUrl
            ? ' اعتبارنامه‌ها ذخیره شدند؛ اتصال API پس از پیاده‌سازی درایور. مستندات: '.$this->docsUrl
            : ' اعتبارنامه‌ها ذخیره شدند؛ اتصال API پس از پیاده‌سازی درایور.';

        return [
            'ok' => true,
            'message' => 'پیکربندی آماده است.'.$hint,
        ];
    }
}
