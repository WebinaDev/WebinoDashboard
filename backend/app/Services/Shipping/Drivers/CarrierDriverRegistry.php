<?php

namespace App\Services\Shipping\Drivers;

use App\Services\Shipping\ShippingCarrierCatalog;
use App\Services\Shipping\SnappShippingTracker;
use App\Services\Shipping\TapinClient;
use App\Services\Shipping\TapinShipmentService;

class CarrierDriverRegistry
{
    /** @var array<string, CarrierDriverInterface> */
    protected array $drivers = [];

    public function __construct(
        protected ShippingCarrierCatalog $catalog,
        protected SnappShippingTracker $snapp,
        protected TapinClient $tapin,
        protected TapinShipmentService $tapinShipments,
    ) {
        $this->registerBuiltins();
    }

    protected function registerBuiltins(): void
    {
        $this->drivers['tapin'] = new TapinCarrierDriver($this->tapin, $this->tapinShipments);
        $this->drivers['snapp'] = new SnappCarrierDriver($this->snapp);
        $this->drivers['post'] = new TrackingUrlCarrierDriver('post', 'https://tracking.post.ir/?code={code}');
        $this->drivers['dedicated_courier'] = new LocalRateCarrierDriver('dedicated_courier');
        $this->drivers['barbari'] = new LocalRateCarrierDriver('barbari');

        foreach ($this->catalog->all() as $id => $meta) {
            if (isset($this->drivers[$id])) {
                continue;
            }
            $this->drivers[$id] = new ScaffoldCarrierDriver(
                $id,
                is_array($meta['required'] ?? null) ? $meta['required'] : [],
                is_string($meta['docs_url'] ?? null) ? $meta['docs_url'] : null,
            );
        }
    }

    public function get(string $id): ?CarrierDriverInterface
    {
        return $this->drivers[$id] ?? null;
    }

    /** @return array<string, CarrierDriverInterface> */
    public function all(): array
    {
        return $this->drivers;
    }
}
