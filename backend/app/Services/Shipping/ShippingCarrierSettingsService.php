<?php

namespace App\Services\Shipping;

use App\Services\Modules\ModuleSettingsService;
use App\Services\Shipping\Drivers\CarrierDriverRegistry;

/**
 * Tenant enablement + per-carrier credentials for the shipping hub (payments-hub pattern).
 */
class ShippingCarrierSettingsService
{
    public const MODULE = 'shipping_carriers';

    public function __construct(
        protected ModuleSettingsService $settings,
        protected ShippingCarrierCatalog $catalog,
        protected CarrierDriverRegistry $drivers,
        protected TapinClient $tapin,
    ) {}

    public function catalog(): ShippingCarrierCatalog
    {
        return $this->catalog;
    }

    /** @return array<string, mixed> */
    public function getHub(int $tenantId): array
    {
        $raw = $this->settings->get($tenantId, self::MODULE, 'hub', $this->defaultHub());

        return is_array($raw) ? array_replace_recursive($this->defaultHub(), $raw) : $this->defaultHub();
    }

    /** @return array{enabled: array<string, bool>} */
    public function defaultHub(): array
    {
        $enabled = [];
        foreach ($this->catalog->ids() as $id) {
            // Local / always-on defaults stay off until merchant opts in (except post tracking template).
            $enabled[$id] = in_array($id, ['post'], true);
        }

        return ['enabled' => $enabled];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function saveHub(int $tenantId, array $input): array
    {
        $current = $this->getHub($tenantId);
        if (isset($input['enabled']) && is_array($input['enabled'])) {
            foreach ($this->catalog->ids() as $id) {
                if (array_key_exists($id, $input['enabled'])) {
                    $current['enabled'][$id] = (bool) $input['enabled'][$id];
                }
            }
        }

        return $this->settings->put($tenantId, self::MODULE, 'hub', $current);
    }

    public function setCarrierEnabled(int $tenantId, string $carrierId, bool $enabled): array
    {
        if (! $this->catalog->has($carrierId)) {
            abort(422, 'Unknown carrier');
        }
        $hub = $this->getHub($tenantId);
        $hub['enabled'][$carrierId] = $enabled;

        return $this->settings->put($tenantId, self::MODULE, 'hub', $hub);
    }

    public function isEnabled(int $tenantId, string $carrierId): bool
    {
        $hub = $this->getHub($tenantId);

        return (bool) ($hub['enabled'][$carrierId] ?? false);
    }

    /** @return array<string, mixed> */
    public function getRaw(int $tenantId, string $carrierId): array
    {
        if ($carrierId === 'tapin') {
            return $this->tapin->getRaw($tenantId);
        }
        $defaults = $this->catalog->defaults($carrierId);

        return $this->settings->get($tenantId, self::MODULE, $carrierId, $defaults);
    }

    /** @return array<string, mixed> */
    public function getPublic(int $tenantId, string $carrierId): array
    {
        if ($carrierId === 'tapin') {
            $pub = $this->tapin->getPublic($tenantId);
            $pub['_meta'] = $this->metaPayload($carrierId);

            return $pub;
        }
        $raw = $this->getRaw($tenantId, $carrierId);
        $secrets = $this->catalog->secretKeys();
        foreach ($secrets as $key) {
            if (array_key_exists($key, $raw)) {
                $filled = filled($raw[$key] ?? null);
                unset($raw[$key]);
                $raw['has_'.$key] = $filled;
            }
        }
        $raw['_meta'] = $this->metaPayload($carrierId);

        return $raw;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, string $carrierId, array $input): array
    {
        if (! $this->catalog->has($carrierId)) {
            abort(404, 'Unknown carrier');
        }
        if ($carrierId === 'tapin') {
            // Dedicated Tapin panel owns full schema; hub only toggles enablement.
            return $this->getPublic($tenantId, $carrierId);
        }
        $current = $this->getRaw($tenantId, $carrierId);
        $defaults = $this->catalog->defaults($carrierId);
        $secrets = $this->catalog->secretKeys();
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $val = $input[$key];
            if (in_array($key, $secrets, true)) {
                if ($val === null || $val === '' || (is_string($val) && str_contains($val, '•'))) {
                    continue;
                }
                $current[$key] = (string) $val;
                continue;
            }
            if (is_bool($default)) {
                $current[$key] = (bool) $val;
            } elseif (is_int($default)) {
                $current[$key] = (int) $val;
            } elseif (is_float($default)) {
                $current[$key] = (float) $val;
            } elseif (is_array($default)) {
                $current[$key] = is_array($val) ? $val : $default;
            } else {
                $current[$key] = is_scalar($val) || $val === null ? $val : $default;
            }
        }
        $this->settings->put($tenantId, self::MODULE, $carrierId, $current);

        return $this->getPublic($tenantId, $carrierId);
    }

    public function configured(int $tenantId, string $carrierId): bool
    {
        $meta = $this->catalog->get($carrierId);
        if (! empty($meta['local'])) {
            return true;
        }
        if ($carrierId === 'tapin') {
            return $this->tapin->isReady($tenantId);
        }
        $raw = $this->getRaw($tenantId, $carrierId);
        $required = $this->catalog->required($carrierId);
        if ($required === []) {
            return true;
        }
        foreach ($required as $key) {
            if (! filled($raw[$key] ?? null)) {
                return false;
            }
        }

        return true;
    }

    /** @return array{ok: bool, message: string} */
    public function testConnection(int $tenantId, string $carrierId): array
    {
        $driver = $this->drivers->get($carrierId);
        if (! $driver) {
            return ['ok' => false, 'message' => 'Unknown carrier'];
        }
        $config = $this->getRaw($tenantId, $carrierId);
        $config['_tenant_id'] = $tenantId;

        return $driver->testConnection($config);
    }

    /**
     * @return array{categories: list<array<string, mixed>>, items: list<array<string, mixed>>, matrix: array{live: list<string>, scaffold: list<string>}}
     */
    public function hubPayload(int $tenantId): array
    {
        $hub = $this->getHub($tenantId);
        $items = [];
        foreach ($this->catalog->all() as $id => $meta) {
            $configured = $this->configured($tenantId, $id);
            $enabled = (bool) ($hub['enabled'][$id] ?? false);
            $status = (string) ($meta['status'] ?? 'scaffold');
            $comingSoon = $status === 'scaffold';
            $local = ! empty($meta['local']);
            $items[] = [
                'id' => $id,
                'title_key' => $id,
                'label_fa' => $meta['label_fa'] ?? $id,
                'label_en' => $meta['label_en'] ?? $id,
                'category' => $meta['category'] ?? 'freight',
                'carrier_id' => $id,
                'enabled' => $enabled,
                'available' => $local || $configured || $comingSoon || $status === 'live',
                'configured' => $configured,
                'status' => $status,
                'coming_soon' => $comingSoon,
                'docs_url' => $this->catalog->docsUrl($id),
                'supports' => $meta['supports'] ?? [],
                'delivery_types' => $meta['delivery_types'] ?? [],
                'settings_path' => $this->catalog->settingsPath($id),
            ];
        }

        $categories = [];
        foreach ($this->catalog->categories() as $catId => $cat) {
            $categories[] = [
                'id' => $catId,
                'label_fa' => $cat['label_fa'],
                'label_en' => $cat['label_en'],
                'order' => $cat['order'] ?? 100,
            ];
        }

        return [
            'categories' => $categories,
            'items' => $items,
            'matrix' => $this->catalog->statusMatrix(),
        ];
    }

    /** @return array<string, mixed> */
    protected function metaPayload(string $carrierId): array
    {
        $meta = $this->catalog->get($carrierId) ?? [];

        return [
            'id' => $carrierId,
            'status' => $meta['status'] ?? 'scaffold',
            'category' => $meta['category'] ?? 'freight',
            'label_fa' => $meta['label_fa'] ?? $carrierId,
            'label_en' => $meta['label_en'] ?? $carrierId,
            'docs_url' => $this->catalog->docsUrl($carrierId),
            'fields' => $this->catalog->fields($carrierId),
            'coming_soon' => ($meta['status'] ?? '') === 'scaffold',
            'supports' => $meta['supports'] ?? [],
        ];
    }
}
