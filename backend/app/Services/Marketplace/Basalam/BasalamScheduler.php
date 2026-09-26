<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\Tenant;
use App\Services\Marketplace\Adapters\BasalamAdapter;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Throwable;

/**
 * Five-minute Basalam upkeep per tenant: token refresh, discount tasks, webhook health,
 * order polling fallback, health alerts and request-log pruning.
 */
class BasalamScheduler
{
    public const ORDER_POLL_INTERVAL = 900;

    public const WEBHOOK_CHECK_INTERVAL = 3600;

    public const HEALTH_INTERVAL = 3600;

    public function __construct(protected MarketplaceSettingsService $settings, protected MarketplaceSync $sync) {}

    public function tick(): void
    {
        foreach (Tenant::query()->pluck('id') as $tenantId) {
            $tenantId = (int) $tenantId;
            if (! $this->settings->isEnabled($tenantId, 'basalam')) {
                continue;
            }
            $auth = BasalamAuth::for($tenantId);
            if (! $auth->isConnected()) {
                continue;
            }
            try {
                $this->tickTenant($tenantId, $auth);
            } catch (Throwable $e) {
                MarketplaceLogger::error($tenantId, 'basalam', 'scheduler', 'Basalam tick failed: '.$e->getMessage());
            }
        }
        BasalamRequestLog::prune(7);
    }

    public function tickTenant(int $tenantId, BasalamAuth $auth): void
    {
        if ($auth->refreshToken() !== '' && $auth->expiresWithin(1800)) {
            $auth->refresh();
        }

        BasalamDiscounts::for($tenantId)->process();

        $state = $this->settings->state($tenantId, 'basalam');
        $now = time();
        $patch = [];

        if ($now - (int) ($state['webhook_checked_at'] ?? 0) >= self::WEBHOOK_CHECK_INTERVAL) {
            $patch['webhook_checked_at'] = $now;
            $webhooks = BasalamWebhooks::for($tenantId);
            if (empty($state['webhook_id']) && $webhooks->canRegister()) {
                try {
                    $webhooks->setup();
                } catch (Throwable $e) {
                    MarketplaceLogger::warning($tenantId, 'basalam', 'webhook', 'Webhook setup failed: '.$e->getMessage());
                }
            }
        }

        $engine = app(BasalamSettings::class)->engine($tenantId);
        if ($engine['sync_status_order'] && $now - (int) ($state['orders_polled_at'] ?? 0) >= self::ORDER_POLL_INTERVAL) {
            $patch['orders_polled_at'] = $now;
            $this->sync->enqueue($tenantId, 'basalam', BasalamOrders::JOB_FETCH, ['day' => 2], 6, 0, 'basalam:poll-orders');
        }

        if ($now - (int) ($state['health_checked_at'] ?? 0) >= self::HEALTH_INTERVAL) {
            $patch['health_checked_at'] = $now;
            /** @var BasalamAdapter $adapter */
            $adapter = MarketplaceAdapterRegistry::make('basalam', $tenantId);
            $health = $adapter->health();
            foreach (BasalamAdapter::alertsFor($health) as $alert) {
                MarketplaceLogger::warning($tenantId, 'basalam', 'health', 'Basalam alert: '.$alert['code'], ['level' => $alert['level']]);
            }
        }

        if ($patch) {
            $this->settings->putState($tenantId, 'basalam', $patch);
        }
    }
}
