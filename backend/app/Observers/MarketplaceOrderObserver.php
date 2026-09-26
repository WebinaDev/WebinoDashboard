<?php

namespace App\Observers;

use App\Models\Order;
use App\Services\Marketplace\MarketplaceOrderImporter;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Throwable;

/**
 * Pushes manual status changes of marketplace orders back to the platform when auto-sync is on.
 * Changes written by the importer itself are ignored.
 */
class MarketplaceOrderObserver
{
    /** @var array<string, string> platform => job type */
    public const STATUS_JOBS = [
        'digikala' => 'dk_order_status',
    ];

    public function updated(Order $order): void
    {
        if (MarketplaceOrderImporter::$importing || ! $order->wasChanged('status')) {
            return;
        }
        $platform = (string) $order->sales_channel;
        $job = self::STATUS_JOBS[$platform] ?? null;
        if (! $job) {
            return;
        }
        try {
            if (! app(MarketplaceSettingsService::class)->isAutoSync($order->tenant_id, $platform)) {
                return;
            }
            app(MarketplaceSync::class)->enqueue(
                $order->tenant_id,
                $platform,
                $job,
                ['order_id' => $order->id, 'action' => $order->status, 'strict' => false, 'source' => 'status_change'],
                4,
                5,
            );
        } catch (Throwable $e) {
            report($e);
        }
    }
}
