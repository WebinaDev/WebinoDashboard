<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceJob;
use App\Models\MarketplaceLog;
use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\Basalam\BasalamBooth;
use App\Services\Marketplace\Basalam\BasalamClient;
use App\Services\Marketplace\Basalam\BasalamDiscounts;
use App\Services\Marketplace\Basalam\BasalamEndpoints;
use App\Services\Marketplace\Basalam\BasalamOrders;
use App\Services\Marketplace\Basalam\BasalamProducts;
use App\Services\Marketplace\Basalam\BasalamRequestLog;
use App\Services\Marketplace\MarketplaceException;

/**
 * Basalam (WebinoBasalam engine port): OAuth via the ERP, standalone-variant product sync,
 * webhook + polled orders, discounts, booth, finance and Basalam Pay.
 */
class BasalamAdapter extends BaseAdapter
{
    protected ?BasalamClient $client = null;

    public function platform(): string
    {
        return 'basalam';
    }

    public function client(): BasalamClient
    {
        return $this->client ??= new BasalamClient($this->tenantId, $this->settings);
    }

    public function products(): BasalamProducts
    {
        return new BasalamProducts($this->client());
    }

    public function orders(): BasalamOrders
    {
        return new BasalamOrders($this->client());
    }

    public function booth(): BasalamBooth
    {
        return new BasalamBooth($this->client());
    }

    public function credentialsPublic(): array
    {
        $c = $this->credentials();

        return [
            'vendor_id' => $c['vendor_id'] ?? null,
            'has_access_token' => filled($c['access_token'] ?? null),
            'has_refresh_token' => filled($c['refresh_token'] ?? null),
            'has_webhook_token' => filled($c['webhook_token'] ?? null),
        ];
    }

    public function testConnection(): array
    {
        $vendor = $this->booth()->vendor(true);
        if (! $vendor) {
            $this->fail(__('marketplace.basalam_not_connected'));
        }

        return [
            'ok' => true,
            'message' => __('marketplace.connection_ok'),
            'details' => ['auth' => $this->client()->auth()->status(), 'vendor' => array_intersect_key($vendor, array_flip(['id', 'title', 'identifier', 'status']))],
        ];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $res = $this->products()->remoteProducts($keyword !== '' ? $keyword : null);

        return array_map(fn ($p) => [
            'id' => (string) ($p['id'] ?? ''),
            'variant_id' => '',
            'title' => (string) ($p['title'] ?? $p['name'] ?? ''),
            'price' => (int) ($p['primary_price'] ?? $p['price'] ?? 0),
            'stock' => (int) ($p['stock'] ?? $p['inventory'] ?? 0),
            'sku' => (string) ($p['sku'] ?? ''),
            'image' => (string) (data_get($p, 'photo.md') ?? data_get($p, 'photo.url') ?? data_get($p, 'photos.0.md') ?? ''),
            'status' => data_get($p, 'status.id') ?? $p['status'] ?? null,
        ], $res['data']);
    }

    // ── Price / stock ───────────────────────────────────────────────────

    /** @return array{0: int, 1: int} Basalam rial price (0 when below minimum) and stock. */
    public function priceStockFor(MarketplaceProductMap $map): array
    {
        $products = $this->products();

        return [(int) ($products->price($map->product, $map->variant) ?? 0), $products->stock($map->product, $map->variant)];
    }

    protected function remote(MarketplaceProductMap $map): string
    {
        $id = (string) ($map->remote_product_id ?? '');
        if ($id === '') {
            $this->fail(__('marketplace.basalam_product_not_connected', ['id' => $map->product_id]));
        }

        return $id;
    }

    public function pushPrice(MarketplaceProductMap $map, int $price): void
    {
        if ($price > 0) {
            $this->products()->updateRemote($this->remote($map), ['primary_price' => $price]);
        }
    }

    public function pushStock(MarketplaceProductMap $map, int $stock): void
    {
        $this->products()->updateRemote($this->remote($map), ['stock' => max(0, $stock)]);
    }

    public function pushPriceStock(MarketplaceProductMap $map, int $price, int $stock): void
    {
        $body = ['stock' => max(0, $stock)];
        if ($price > 0) {
            $body['primary_price'] = $price;
        }
        $this->products()->updateRemote($this->remote($map), $body);
    }

    public function supportsCreate(): bool
    {
        return true;
    }

    public function createProduct(Product $product, ?ProductVariant $variant = null): array
    {
        $result = $this->products()->create($product, null, $variant);
        $id = (string) ($result['basalam_id'] ?? '');

        return ['stored' => true, 'remote_product_id' => $id, 'remote_url' => $id !== '' ? 'https://basalam.com/p/'.$id : null] + $result;
    }

    // ── Orders ──────────────────────────────────────────────────────────

    /**
     * Recent parcels (default 7 days, up to 10 pages) as invoice ids; details are fetched by the
     * importer only for unseen invoices.
     */
    public function pullOrders(array $args = []): array
    {
        $day = BasalamOrders::clampDays($args['day'] ?? $args['days'] ?? 7, 7);
        $maxPages = max(1, min(30, (int) ($args['max_pages'] ?? 10)));
        $orders = $this->orders();
        $out = [];
        $cursor = null;
        for ($i = 0; $i < $maxPages; $i++) {
            $page = $orders->fetchPage($day, $cursor);
            foreach ($page['orders'] as $parcel) {
                $invoice = (int) data_get($parcel, 'order.id', 0);
                if ($invoice > 0) {
                    $out[(string) $invoice] = ['id' => (string) $invoice, 'parcel' => $parcel];
                }
            }
            $cursor = $page['next_cursor'];
            if (! $cursor) {
                break;
            }
        }
        $this->putState(['orders_pulled_at' => now()->toIso8601String()]);

        return array_values($out);
    }

    public function getOrder(string $remoteId): ?array
    {
        $detail = $this->orders()->detail((int) $remoteId);

        return array_merge($detail, ['id' => $remoteId, 'invoice_id' => (int) $remoteId]);
    }

    public function normalizeOrder(array $raw): array
    {
        return $this->orders()->normalize($raw);
    }

    public function mapOrderStatus(string $remoteStatus): string
    {
        return $this->orders()->mapStatus($remoteStatus);
    }

    /** @param  array<string, mixed>  $raw */
    public function orderExtra(array $raw): array
    {
        return $this->orders()->extra($raw);
    }

    // ── Jobs ────────────────────────────────────────────────────────────

    public function runJob(string $type, array $payload): array
    {
        $payload = array_diff_key($payload, ['_key' => 1, 'result' => 1]);
        $products = $this->products()->runJob($type, $payload);
        if ($products !== null) {
            return $products;
        }

        return match ($type) {
            BasalamOrders::JOB_EVENT => $this->orders()->handleEvent($payload),
            BasalamOrders::JOB_FETCH => $this->orders()->fetchJob($payload),
            'basalam_discount_tick' => BasalamDiscounts::for($this->tenantId)->process(true),
            default => throw new MarketplaceException("Unknown Basalam job [{$type}]", 422),
        };
    }

    // ── Health ──────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function health(): array
    {
        $jobs = MarketplaceJob::query()->where('tenant_id', $this->tenantId)->where('platform', 'basalam');
        $pending = (clone $jobs)->whereIn('status', ['pending', 'retrying'])->count();
        $running = (clone $jobs)->where('status', 'running')->count();
        $failed = (clone $jobs)->where('status', 'failed')->where('updated_at', '>=', now()->subDay())->count();
        $errors = MarketplaceLog::query()->where('tenant_id', $this->tenantId)->where('platform', 'basalam')
            ->where('level', 'error')->where('created_at', '>=', now()->subDay())->count();
        $auth = $this->client()->auth()->status();
        $breaker = $this->client()->breaker()->snapshot();
        $requests = BasalamRequestLog::summary($this->tenantId);
        $duplicates = count($this->products()->duplicateConnections());
        $state = $this->state();

        $status = 'healthy';
        if (! $auth['connected'] || ! empty($auth['auth_error']) || $breaker['state'] === 'open' || $errors > 30) {
            $status = 'critical';
        } elseif ($errors > 5 || $pending > 50 || $duplicates > 0 || $breaker['state'] === 'half_open') {
            $status = 'warning';
        }

        return [
            'status' => $status,
            'auth_ok' => $auth['connected'] && empty($auth['auth_error']),
            'auth' => $auth,
            'circuit' => $breaker,
            'requests' => $requests,
            'queue_pending' => $pending,
            'queue_running' => $running,
            'jobs_failed_24h' => $failed,
            'errors_24h' => $errors,
            'duplicates' => $duplicates,
            'discounts' => BasalamDiscounts::for($this->tenantId)->stats(),
            'webhook_id' => $state['webhook_id'] ?? null,
            'webhook_registered_at' => $state['webhook_registered_at'] ?? null,
            'orders_pulled_at' => $state['orders_pulled_at'] ?? null,
            'chat_alert' => $state['chat_alert'] ?? null,
            'checked_at' => now()->toIso8601String(),
        ];
    }

    /** @return list<array{level: string, code: string}> */
    public static function alertsFor(array $health): array
    {
        $alerts = [];
        if (empty($health['auth_ok'])) {
            $alerts[] = ['level' => 'critical', 'code' => 'auth'];
        }
        if (($health['circuit']['state'] ?? 'closed') === 'open') {
            $alerts[] = ['level' => 'critical', 'code' => 'circuit_open'];
        }
        if ((int) ($health['errors_24h'] ?? 0) > 5) {
            $alerts[] = ['level' => 'warning', 'code' => 'errors'];
        }
        if ((int) ($health['queue_pending'] ?? 0) > 50) {
            $alerts[] = ['level' => 'warning', 'code' => 'backlog'];
        }
        if ((int) ($health['duplicates'] ?? 0) > 0) {
            $alerts[] = ['level' => 'warning', 'code' => 'duplicates'];
        }
        if ((int) ($health['discounts']['failed'] ?? 0) > 0) {
            $alerts[] = ['level' => 'warning', 'code' => 'discount_failures'];
        }
        if (empty($health['webhook_id']) && ! empty($health['auth_ok'])) {
            $alerts[] = ['level' => 'warning', 'code' => 'webhook'];
        }

        return $alerts;
    }

    public static function statusLabel(int $statusId): string
    {
        return match ($statusId) {
            BasalamProducts::STATUS_ACTIVE => 'active',
            BasalamProducts::STATUS_ARCHIVED => 'archived',
            default => (string) $statusId,
        };
    }

    public static function isShippingMethod(int $id): bool
    {
        return isset(BasalamEndpoints::SHIPPING_METHODS[$id]);
    }
}
