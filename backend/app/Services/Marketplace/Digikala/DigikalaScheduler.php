<?php

namespace App\Services\Marketplace\Digikala;

use App\Models\Tenant;
use App\Services\Marketplace\Adapters\DigikalaAdapter;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Throwable;

/**
 * Hourly Digikala upkeep per tenant: refresh tokens before expiry and record health alerts.
 */
class DigikalaScheduler
{
    public function __construct(protected MarketplaceSettingsService $settings) {}

    public function tick(): void
    {
        foreach (Tenant::query()->pluck('id') as $tenantId) {
            $tenantId = (int) $tenantId;
            if (! $this->settings->isEnabled($tenantId, 'digikala')) {
                continue;
            }
            $auth = DigikalaAuth::for($tenantId);
            if (! $auth->isConnected()) {
                continue;
            }
            try {
                $this->refreshIfNeeded($auth);
                /** @var DigikalaAdapter $adapter */
                $adapter = MarketplaceAdapterRegistry::make('digikala', $tenantId);
                $health = $adapter->health();
                foreach (DigikalaAdapter::alertsFor($health) as $alert) {
                    MarketplaceLogger::warning($tenantId, 'digikala', 'health', 'Digikala alert: '.$alert['code'], $health);
                }
            } catch (Throwable $e) {
                MarketplaceLogger::error($tenantId, 'digikala', 'health', 'Digikala tick failed: '.$e->getMessage());
            }
        }
    }

    /** Refresh when the access token expires within the next two hours. */
    public function refreshIfNeeded(DigikalaAuth $auth): void
    {
        $t = $auth->tokens();
        $exp = (int) ($t['access_expires_at'] ?? 0);
        if (! empty($t['refresh_token']) && $exp > 0 && $exp <= time() + 7200) {
            $auth->refresh();
        }
    }
}
