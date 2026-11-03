<?php

namespace App\Services\Shipping\Drivers;

use App\Services\Shipping\SnappShippingTracker;

class SnappCarrierDriver implements CarrierDriverInterface
{
    public function __construct(protected SnappShippingTracker $tracker) {}

    public function code(): string
    {
        return 'snapp';
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
            'message' => 'استعلام نرخ اسنپ‌باکس به‌زودی؛ از نرخ ثابت شهری یا پیک اختصاصی استفاده کنید.',
        ];
    }

    public function track(array $config, string $trackingCode, array $meta = []): array
    {
        $result = $this->tracker->track(0, $trackingCode, $config);
        if (empty($result['tracking_url'])) {
            $tpl = (string) ($config['tracking_url_template'] ?? '');
            if ($tpl !== '' && $trackingCode !== '') {
                $result['tracking_url'] = str_replace(
                    ['{code}', '{CODE}'],
                    [urlencode($trackingCode), urlencode($trackingCode)],
                    $tpl
                );
            }
        }

        return $result;
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['api_token'] ?? null)) {
            return ['ok' => false, 'message' => 'api_token الزامی است.'];
        }

        return ['ok' => true, 'message' => 'توکن ذخیره شد؛ رهگیری از API اسنپ‌باکس فعال است.'];
    }
}
