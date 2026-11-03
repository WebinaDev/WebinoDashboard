<?php

namespace App\Services\Payments;

/**
 * Reads config/payment_gateways.php — single source of truth for hub + settings.
 */
class PaymentGatewayCatalog
{
    /** @return array<string, array{label_fa: string, label_en: string, order: int}> */
    public function categories(): array
    {
        /** @var array<string, array{label_fa: string, label_en: string, order: int}> $cats */
        $cats = config('payment_gateways.categories', []);

        uasort($cats, fn ($a, $b) => ($a['order'] ?? 100) <=> ($b['order'] ?? 100));

        return $cats;
    }

    /** @return array<string, array<string, mixed>> */
    public function all(): array
    {
        /** @var array<string, array<string, mixed>> $gateways */
        $gateways = config('payment_gateways.gateways', []);

        return $gateways;
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

    /** @return list<string> */
    public function checkoutIds(): array
    {
        $out = [];
        foreach ($this->all() as $id => $meta) {
            if (! empty($meta['checkout'])) {
                $out[] = $id;
            }
        }

        return $out;
    }

    /** Online IPG/BNPL ids that may appear at storefront checkout when live+enabled. */
    /** @return list<string> */
    public function commerceIds(): array
    {
        $out = [];
        foreach ($this->all() as $id => $meta) {
            if (empty($meta['checkout'])) {
                continue;
            }
            if (! empty($meta['local'])) {
                continue;
            }
            if (in_array($id, ['cod', 'basalam_pay', 'bale_pay'], true)) {
                continue;
            }
            $out[] = $id;
        }

        return $out;
    }

    /** @return list<string> */
    public function liveCommerceIds(): array
    {
        $out = [];
        foreach ($this->commerceIds() as $id) {
            if (($this->get($id)['status'] ?? '') === 'live') {
                $out[] = $id;
            }
        }

        return $out;
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
        $keys = [
            'access_token',
            'client_secret',
            'password',
            'client_password',
            'merchant_id',
            'api_key',
            'api_token',
            'secret_key',
            'terminal_key',
            'private_key',
            'public_key',
            'pin',
            'login_account',
            'webhook_secret',
            'ipn_secret',
            'publishable_key',
            'passphrase',
            'alternate_passphrase',
        ];
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

        return '/dashboard/settings/shop/'.$slug;
    }

    public function docsUrl(string $id): ?string
    {
        $url = $this->get($id)['docs_url'] ?? null;

        return is_string($url) && $url !== '' ? $url : null;
    }
}
