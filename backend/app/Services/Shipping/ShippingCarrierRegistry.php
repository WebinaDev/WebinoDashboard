<?php

namespace App\Services\Shipping;

use App\Models\Order;
use App\Services\Modules\ModuleSettingsService;

/**
 * Pluggable shipment tracking beyond Tapin.
 */
class ShippingCarrierRegistry
{
    public const MODULE = 'shipping_carriers';

    public function __construct(
        protected ModuleSettingsService $settings,
        protected SnappShippingTracker $snapp,
        protected TapinClient $tapin,
    ) {}

    /** @return array<string, mixed> */
    public function hub(int $tenantId): array
    {
        $raw = $this->settings->get($tenantId, self::MODULE, 'hub', $this->defaultHub());

        return is_array($raw) ? $raw : $this->defaultHub();
    }

    /** @return array<string, mixed> */
    public function defaultHub(): array
    {
        return [
            'tapin' => ['enabled' => true],
            'snapp' => ['enabled' => false, 'api_token' => '', 'has_api_token' => false],
            'post' => ['enabled' => false, 'tracking_url_template' => 'https://tracking.post.ir/?code={code}'],
        ];
    }

    /** @return array{carrier: string, status: string|null, events: list<array<string, mixed>>, tracking_url: string|null} */
    public function track(int $tenantId, Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $code = $order->trackingCode();
        $hub = $this->hub($tenantId);

        if (! empty($hub['snapp']['enabled']) && ! empty($meta['snapp']['tracking_code'])) {
            return $this->snapp->track($tenantId, (string) $meta['snapp']['tracking_code'], $hub['snapp'] ?? []);
        }

        if ($code && ! empty($hub['post']['enabled'])) {
            $tpl = (string) ($hub['post']['tracking_url_template'] ?? '');
            $url = str_replace('{code}', urlencode($code), $tpl);

            return [
                'carrier' => 'post',
                'status' => (string) ($meta['shipping_status'] ?? 'in_transit'),
                'events' => [],
                'tracking_url' => $url !== '' ? $url : null,
            ];
        }

        if ($code && ! empty($hub['tapin']['enabled']) && ! empty($meta['tapin'])) {
            return [
                'carrier' => 'tapin',
                'status' => (string) ($meta['tapin']['status'] ?? $order->status),
                'events' => is_array($meta['tapin']['events'] ?? null) ? $meta['tapin']['events'] : [],
                'tracking_url' => $order->trackingUrl(),
            ];
        }

        return [
            'carrier' => 'unknown',
            'status' => null,
            'events' => [],
            'tracking_url' => $order->trackingUrl(),
        ];
    }
}
