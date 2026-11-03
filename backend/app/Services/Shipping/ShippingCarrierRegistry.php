<?php

namespace App\Services\Shipping;

use App\Models\Order;
use App\Services\Shipping\Drivers\CarrierDriverRegistry;

/**
 * Pluggable shipment tracking + hub bridge (payments-hub style).
 */
class ShippingCarrierRegistry
{
    public const MODULE = ShippingCarrierSettingsService::MODULE;

    public function __construct(
        protected ShippingCarrierSettingsService $carrierSettings,
        protected CarrierDriverRegistry $drivers,
        protected TapinClient $tapin,
    ) {}

    /** @return array<string, mixed> */
    public function hub(int $tenantId): array
    {
        // Legacy shape for ShopExtrasAdminController consumers + full hub payload.
        $payload = $this->carrierSettings->hubPayload($tenantId);
        $legacy = [];
        foreach ($payload['items'] as $item) {
            $id = (string) $item['id'];
            $raw = $this->carrierSettings->getPublic($tenantId, $id);
            $legacy[$id] = array_merge(
                ['enabled' => (bool) $item['enabled'], 'status' => $item['status']],
                array_diff_key($raw, ['_meta' => true])
            );
        }

        return array_merge($legacy, [
            '_hub' => $payload,
        ]);
    }

    /** @return array{carrier: string, status: string|null, events: list<array<string, mixed>>, tracking_url: string|null} */
    public function track(int $tenantId, Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $code = $order->trackingCode();
        $preferred = (string) ($meta['shipping_carrier'] ?? $meta['carrier'] ?? '');

        $candidates = array_values(array_filter(array_unique([
            $preferred,
            ! empty($meta['snapp']) ? 'snapp' : null,
            ! empty($meta['tapin']) ? 'tapin' : null,
            'post',
        ])));

        foreach ($candidates as $carrierId) {
            if ($carrierId === '' || ! $this->carrierSettings->isEnabled($tenantId, $carrierId)) {
                continue;
            }
            $driver = $this->drivers->get($carrierId);
            if (! $driver) {
                continue;
            }
            $trackCode = $code;
            if ($carrierId === 'snapp' && ! empty($meta['snapp']['tracking_code'])) {
                $trackCode = (string) $meta['snapp']['tracking_code'];
            }
            if ($trackCode === '' || $trackCode === null) {
                continue;
            }
            $config = $this->carrierSettings->getRaw($tenantId, $carrierId);

            return $driver->track($config, (string) $trackCode, $meta);
        }

        return [
            'carrier' => 'unknown',
            'status' => null,
            'events' => [],
            'tracking_url' => $order->trackingUrl(),
        ];
    }
}
