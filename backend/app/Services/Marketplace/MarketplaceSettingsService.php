<?php

namespace App\Services\Marketplace;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Validation\ValidationException;

/**
 * Per-tenant marketplace settings stored in module_settings (`marketplace.{platform}`),
 * plus a private runtime state bucket (`marketplace.state.{platform}`) for tokens/expiry.
 */
class MarketplaceSettingsService
{
    public const MODULE = 'marketplace';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function raw(int $tenantId, string $platform): array
    {
        $defaults = MarketplacePlatforms::defaults($platform);
        $row = $this->settings->get($tenantId, self::MODULE, $platform, []);
        $creds = is_array($row['credentials'] ?? null) ? $row['credentials'] : [];

        return [
            'enabled' => (bool) ($row['enabled'] ?? $defaults['enabled']),
            'auto_sync' => (bool) ($row['auto_sync'] ?? $defaults['auto_sync']),
            'credentials' => array_merge($defaults['credentials'], $creds),
        ];
    }

    /** @return array<string, mixed> */
    public function credentials(int $tenantId, string $platform): array
    {
        return $this->raw($tenantId, $platform)['credentials'];
    }

    /** @return array<string, mixed> */
    public function publicView(int $tenantId, string $platform): array
    {
        $raw = $this->raw($tenantId, $platform);
        foreach (MarketplacePlatforms::SECRETS[$platform] ?? [] as $key) {
            $raw['credentials']['has_'.$key] = filled($raw['credentials'][$key] ?? null);
            unset($raw['credentials'][$key]);
        }

        return $raw;
    }

    /**
     * @param  array<string, mixed>  $payload  {enabled?, auto_sync?, credentials?, clear_secrets?}
     * @return array<string, mixed>
     */
    public function save(int $tenantId, string $platform, array $payload): array
    {
        $current = $this->raw($tenantId, $platform);
        $secrets = MarketplacePlatforms::SECRETS[$platform] ?? [];
        $known = array_keys(MarketplacePlatforms::defaults($platform)['credentials']);

        if (array_key_exists('enabled', $payload)) {
            $current['enabled'] = (bool) $payload['enabled'];
        }
        if (array_key_exists('auto_sync', $payload)) {
            $current['auto_sync'] = (bool) $payload['auto_sync'];
        }

        $incoming = is_array($payload['credentials'] ?? null) ? $payload['credentials'] : [];
        foreach ($incoming as $key => $value) {
            if (! in_array($key, $known, true)) {
                continue;
            }
            if (in_array($key, $secrets, true)) {
                if ($value === null || (is_string($value) && (trim($value) === '' || str_contains($value, '•')))) {
                    continue;
                }
            }
            $current['credentials'][$key] = is_string($value) ? trim($value) : $value;
        }
        foreach ((array) ($payload['clear_secrets'] ?? []) as $key) {
            if (in_array($key, $secrets, true)) {
                $current['credentials'][$key] = '';
            }
        }

        if ($platform === 'digikala' && $current['enabled'] && ! filled($current['credentials']['webhook_secret'] ?? null)) {
            throw ValidationException::withMessages([
                'webhook_secret' => [__('marketplace.digikala_webhook_secret_required')],
            ]);
        }

        $this->settings->put($tenantId, self::MODULE, $platform, $current);

        return $this->publicView($tenantId, $platform);
    }

    /** @param  array<string, mixed>  $credentials */
    public function patchCredentials(int $tenantId, string $platform, array $credentials): void
    {
        $current = $this->raw($tenantId, $platform);
        $current['credentials'] = array_merge($current['credentials'], $credentials);
        $this->settings->put($tenantId, self::MODULE, $platform, $current);
    }

    public function isEnabled(int $tenantId, string $platform): bool
    {
        return (bool) $this->raw($tenantId, $platform)['enabled'];
    }

    public function isAutoSync(int $tenantId, string $platform): bool
    {
        $raw = $this->raw($tenantId, $platform);

        return $raw['enabled'] && $raw['auto_sync'];
    }

    /** @return array<string, mixed> */
    public function state(int $tenantId, string $platform): array
    {
        return $this->settings->get($tenantId, self::MODULE, 'state.'.$platform, []);
    }

    /** @param  array<string, mixed>  $patch */
    public function putState(int $tenantId, string $platform, array $patch): array
    {
        $next = array_merge($this->state($tenantId, $platform), $patch);

        return $this->settings->put($tenantId, self::MODULE, 'state.'.$platform, $next);
    }

    public function clearState(int $tenantId, string $platform): void
    {
        $this->settings->put($tenantId, self::MODULE, 'state.'.$platform, []);
    }

    /** Arbitrary extra config bucket (e.g. `basalam.engine`). */
    public function bucket(int $tenantId, string $key, array $defaults = []): array
    {
        return array_merge($defaults, $this->settings->get($tenantId, self::MODULE, $key, []));
    }

    public function putBucket(int $tenantId, string $key, array $payload): array
    {
        return $this->settings->put($tenantId, self::MODULE, $key, $payload);
    }
}
