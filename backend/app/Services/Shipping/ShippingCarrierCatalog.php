<?php

namespace App\Services\Shipping;

/**
 * Reads config/shipping_carriers.php — single source of truth for transport hub.
 */
class ShippingCarrierCatalog
{
    /** @return array<string, array{label_fa: string, label_en: string, order: int}> */
    public function categories(): array
    {
        /** @var array<string, array{label_fa: string, label_en: string, order: int}> $cats */
        $cats = config('shipping_carriers.categories', []);
        uasort($cats, fn ($a, $b) => ($a['order'] ?? 100) <=> ($b['order'] ?? 100));

        return $cats;
    }

    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        /** @var array<string, array<string, mixed>> $carriers */
        $carriers = config('shipping_carriers.carriers', []);

        return $carriers;
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_keys($this->all());
    }

    public function has(string $id): bool
    {
        return isset($this->all()[$id]);
    }

    /** @return array<string, mixed>|null */
    public function get(string $id): ?array
    {
        return $this->all()[$id] ?? null;
    }

    public function isLive(string $id): bool
    {
        return ($this->get($id)['status'] ?? '') === 'live';
    }

    public function isScaffold(string $id): bool
    {
        return ($this->get($id)['status'] ?? '') === 'scaffold';
    }

    /** @return array<string, mixed> */
    public function defaults(string $id): array
    {
        $meta = $this->get($id);

        return is_array($meta['defaults'] ?? null) ? $meta['defaults'] : [];
    }

    /** @return list<string> */
    public function required(string $id): array
    {
        $meta = $this->get($id);

        return is_array($meta['required'] ?? null) ? array_values($meta['required']) : [];
    }

    /** @return list<array<string, mixed>> */
    public function fields(string $id): array
    {
        $meta = $this->get($id);

        return is_array($meta['fields'] ?? null) ? array_values($meta['fields']) : [];
    }

    /** @return list<string> */
    public function secretKeys(): array
    {
        $keys = ['api_token', 'api_key', 'password', 'token', 'secret_key', 'client_secret'];
        foreach ($this->all() as $meta) {
            foreach ($meta['fields'] ?? [] as $field) {
                if (! empty($field['secret']) && ! empty($field['key'])) {
                    $keys[] = (string) $field['key'];
                }
            }
        }

        return array_values(array_unique($keys));
    }

    public function settingsPath(string $id): string
    {
        $meta = $this->get($id);
        if (is_string($meta['settings_path'] ?? null) && $meta['settings_path'] !== '') {
            return $meta['settings_path'];
        }
        $slug = str_replace('_', '-', $id);

        return '/dashboard/settings/shop/shipping/carriers/'.$slug;
    }

    public function docsUrl(string $id): ?string
    {
        $url = $this->get($id)['docs_url'] ?? null;

        return is_string($url) && $url !== '' ? $url : null;
    }

    /** @return list<string> */
    public function supports(string $id): array
    {
        $meta = $this->get($id);

        return is_array($meta['supports'] ?? null) ? array_values($meta['supports']) : [];
    }

    /**
     * Live vs scaffold matrix for ops reports.
     *
     * @return array{live: list<string>, scaffold: list<string>}
     */
    public function statusMatrix(): array
    {
        $live = [];
        $scaffold = [];
        foreach ($this->all() as $id => $meta) {
            if (($meta['status'] ?? '') === 'live') {
                $live[] = $id;
            } else {
                $scaffold[] = $id;
            }
        }

        return ['live' => $live, 'scaffold' => $scaffold];
    }
}
