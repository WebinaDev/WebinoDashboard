<?php

namespace App\Services\Shipping\Drivers;

use App\Services\Shipping\TapinClient;
use App\Services\Shipping\TapinShipmentService;

/**
 * Bridges TapinClient (dedicated settings panel) into the carriers hub.
 */
class TapinCarrierDriver implements CarrierDriverInterface
{
    public function __construct(
        protected TapinClient $tapin,
        protected TapinShipmentService $shipments,
    ) {}

    public function code(): string
    {
        return 'tapin';
    }

    public function status(): string
    {
        return 'live';
    }

    public function quote(array $config, array $context): array
    {
        $tenantId = (int) ($context['tenant_id'] ?? 0);
        if ($tenantId <= 0) {
            return ['ok' => false, 'cost_minor' => null, 'message' => 'tenant required'];
        }
        $cost = $this->shipments->quoteCost($tenantId, $context);
        if ($cost === null) {
            return [
                'ok' => false,
                'cost_minor' => null,
                'message' => 'Tapin quote unavailable — check token/shop or use zone fallback.',
            ];
        }

        return ['ok' => true, 'cost_minor' => $cost];
    }

    public function track(array $config, string $trackingCode, array $meta = []): array
    {
        $url = null;
        if ($trackingCode !== '') {
            $url = 'https://tracking.post.ir/?code='.urlencode($trackingCode);
        }

        return [
            'carrier' => 'tapin',
            'status' => (string) ($meta['tapin']['status'] ?? $meta['shipping_status'] ?? 'in_transit'),
            'events' => is_array($meta['tapin']['events'] ?? null) ? $meta['tapin']['events'] : [],
            'tracking_url' => $url,
        ];
    }

    public function testConnection(array $config): array
    {
        $tenantId = (int) ($config['_tenant_id'] ?? 0);
        if ($tenantId <= 0) {
            return ['ok' => false, 'message' => 'از پنل تاپین برای تست اتصال استفاده کنید.'];
        }
        if (! $this->tapin->isReady($tenantId)) {
            return ['ok' => false, 'message' => 'توکن یا شناسه فروشگاه تاپین تنظیم نشده است.'];
        }
        $res = $this->tapin->shopList($tenantId);

        return [
            'ok' => (bool) ($res['ok'] ?? false),
            'message' => (string) ($res['message'] ?? ($res['ok'] ? 'اتصال تاپین برقرار است.' : 'اتصال ناموفق')),
        ];
    }
}
