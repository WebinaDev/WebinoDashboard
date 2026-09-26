<?php

namespace App\Services\Marketplace;

use App\Models\Product;
use App\Services\Marketplace\Adapters\TorobAdapter;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Debounced Torob product-page webhook (300 s quiet period, batches of 100).
 */
class TorobWebhookQueue
{
    public const DEBOUNCE_SECONDS = 300;

    public const BATCH = 100;

    public function __construct(protected MarketplaceSettingsService $settings) {}

    public function isActive(int $tenantId): bool
    {
        $raw = $this->settings->raw($tenantId, 'torob');

        return $raw['enabled']
            && ! empty($raw['credentials']['product_page_webhook_enabled'])
            && filled($raw['credentials']['webhook_token'] ?? null);
    }

    public function touch(Product $product): void
    {
        if (! $this->isActive($product->tenant_id)) {
            return;
        }
        $url = FeedCatalog::for($product->tenant_id)->productUrl($product);
        DB::table('torob_pending_webhooks')->upsert(
            [['tenant_id' => $product->tenant_id, 'product_id' => $product->id, 'page_url' => $url, 'date_modified' => now()]],
            ['tenant_id', 'product_id'],
            ['page_url', 'date_modified']
        );
    }

    public function pendingCount(int $tenantId): int
    {
        return DB::table('torob_pending_webhooks')->where('tenant_id', $tenantId)->count();
    }

    /** @return list<object> */
    public function pending(int $tenantId, int $limit = 50): array
    {
        return DB::table('torob_pending_webhooks')->where('tenant_id', $tenantId)->orderBy('date_modified')->limit($limit)->get()->all();
    }

    public function flushAll(): void
    {
        $tenantIds = DB::table('torob_pending_webhooks')->distinct()->pluck('tenant_id');
        foreach ($tenantIds as $tid) {
            $this->flush((int) $tid);
        }
    }

    /** @return array{sent: int, status: int} */
    public function flush(int $tenantId, bool $force = false): array
    {
        if (! $this->isActive($tenantId)) {
            return ['sent' => 0, 'status' => 0];
        }
        $token = (string) $this->settings->credentials($tenantId, 'torob')['webhook_token'];
        $cutoff = $force ? now()->addSecond() : now()->subSeconds(self::DEBOUNCE_SECONDS);
        $sent = 0;
        $status = 200;

        while (true) {
            $rows = DB::table('torob_pending_webhooks')
                ->where('tenant_id', $tenantId)
                ->where('date_modified', '<=', $cutoff)
                ->orderBy('date_modified')
                ->limit(self::BATCH)
                ->get();
            if ($rows->isEmpty()) {
                break;
            }
            $items = $rows->map(fn ($r) => ['page_unique' => (string) $r->product_id, 'page_url' => (string) $r->page_url])->values()->all();
            try {
                $res = Http::timeout(15)->withToken($token)->asJson()->post(TorobAdapter::WEBHOOK_URL, ['items' => $items]);
                $status = $res->status();
            } catch (ConnectionException $e) {
                MarketplaceLogger::error($tenantId, 'torob', 'webhook', 'Torob webhook request failed: '.$e->getMessage());

                return ['sent' => $sent, 'status' => 0];
            }
            if ($status === 401) {
                MarketplaceAdapterRegistry::make('torob', $tenantId)->resetWebhookToken();
                MarketplaceLogger::warning($tenantId, 'torob', 'webhook', 'Torob rejected the webhook token (401); token reset');

                return ['sent' => $sent, 'status' => 401];
            }
            if ($status !== 200) {
                MarketplaceLogger::error($tenantId, 'torob', 'webhook', 'Torob webhook returned HTTP '.$status);

                return ['sent' => $sent, 'status' => $status];
            }
            foreach ($rows as $r) {
                DB::table('torob_pending_webhooks')
                    ->where('id', $r->id)
                    ->where('date_modified', $r->date_modified)
                    ->delete();
            }
            $sent += $rows->count();
        }
        if ($sent > 0) {
            MarketplaceLogger::info($tenantId, 'torob', 'webhook', 'Product page webhook sent', ['items' => $sent]);
        }

        return ['sent' => $sent, 'status' => $status];
    }
}
