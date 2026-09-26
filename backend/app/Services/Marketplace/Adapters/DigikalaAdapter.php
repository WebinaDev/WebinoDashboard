<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\MarketplaceJob;
use App\Models\MarketplaceLog;
use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\Digikala\DigikalaAuth;
use App\Services\Marketplace\Digikala\DigikalaWebhooks;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;
use App\Services\Marketplace\MarketplacePricing;
use App\Services\Marketplace\MarketplaceSync;
use App\Services\Marketplace\OrderNormalizer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * Digikala seller Open API (port of WNC_Digikala_Adapter + WebinoDigikala engine sync):
 * DKP→variant mapping, price/stock push, active/history/ship-by-seller order import,
 * SBS status/cancel actions, webhook subscription, reconcile and health.
 */
class DigikalaAdapter extends BaseAdapter
{
    public const VARIANTS = 'open-api/v1/variants';

    public const SELLING_PRICE = 'open-api/v1/variants/selling-price';

    public const BATCH_VARIANT_UPDATE = 'open-api/v1/batch/variant/update';

    public const BATCH_STOCK = 'open-api/v1/batch/variant/seller-stock/update';

    public const ORDERS = 'open-api/v1/orders';

    public const ORDERS_HISTORY = 'open-api/v1/orders/history';

    public const SBS_ORDERS = 'open-api/v1/ship-by-seller-orders';

    public const SBS_UPDATE_STATUS = 'open-api/v1/ship-by-seller-orders/update-status';

    public const SBS_CANCEL_ITEM = 'open-api/v1/ship-by-seller-orders/cancel-item';

    public const PRODUCT_SEARCH = 'open-api/v1/product-creation/search/v2';

    public const WEBHOOK_EVENTS = 'open-api/v1/webhook/event-types';

    public const WEBHOOK_SUBSCRIBE = 'open-api/v1/webhook/subscription';

    public const SBS_ACTIONS = ['processing', 'processed', 'full_delivered_to_customer', 'completed'];

    public function platform(): string
    {
        return 'digikala';
    }

    public function auth(): DigikalaAuth
    {
        return new DigikalaAuth($this->tenantId, $this->settings);
    }

    protected function rateKey(): string
    {
        return 'marketplace:digikala:rate:'.$this->tenantId;
    }

    /**
     * Authenticated Open API call with 429 cooldown and a single refresh-and-retry on 401.
     *
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, mixed $body = null, ?array $query = null, bool $retried = false): array
    {
        $until = (int) Cache::get($this->rateKey(), 0);
        if ($until > time()) {
            throw new MarketplaceException(__('marketplace.digikala_rate_limited'), 429, [], $until - time(), $path);
        }
        $auth = $this->auth();
        $url = MarketplaceHttp::join($auth->baseUrl(), $path);
        try {
            return MarketplaceHttp::request($method, $url, [
                'headers' => ['Authorization' => 'Bearer '.$auth->accessToken(), 'Accept' => 'application/json'],
                'body' => $body,
                'query' => $query,
                'timeout' => 45,
            ]);
        } catch (MarketplaceException $e) {
            if ($e->status === 429) {
                $wait = max(10, $e->retryAfter);
                Cache::put($this->rateKey(), time() + $wait, $wait);
                $this->logError('api', 'Digikala rate limited', ['path' => $path, 'retry_after' => $wait]);
                throw new MarketplaceException(__('marketplace.digikala_rate_limited'), 429, $e->response, $wait, $path);
            }
            if ($e->status === 401 && ! $retried && filled($auth->tokens()['refresh_token'] ?? null)) {
                $auth->refresh();

                return $this->request($method, $path, $body, $query, true);
            }
            $this->logError('api', 'Digikala API error: '.$e->getMessage(), ['path' => $path]);
            throw $e;
        }
    }

    public function testConnection(): array
    {
        $code = (string) ($this->credentials()['client_code'] ?? '');
        try {
            $res = $this->request('GET', 'open-api/v1/auth/scopes'.($code !== '' ? '/'.rawurlencode($code) : ''));
        } catch (MarketplaceException $e) {
            if ($e->isAuthError() && ! $this->auth()->isConnected()) {
                throw $e;
            }
            $res = $this->request('GET', self::VARIANTS, null, ['page' => 1, 'size' => 1]);
        }

        return ['ok' => true, 'message' => __('marketplace.connection_ok'), 'details' => ['auth' => $this->auth()->status(), 'scopes' => $res['data'] ?? null]];
    }

    /** @return array<string, mixed> */
    public function scopes(): array
    {
        $code = (string) ($this->credentials()['client_code'] ?? '');

        return $this->request('GET', 'open-api/v1/auth/scopes'.($code !== '' ? '/'.rawurlencode($code) : ''));
    }

    /** @param  array<string, mixed>  $item */
    protected function variantRow(array $item): array
    {
        return [
            'id' => (string) ($item['product_id'] ?? data_get($item, 'product.id') ?? ''),
            'variant_id' => (string) ($item['id'] ?? $item['product_variant_id'] ?? ''),
            'title' => (string) ($item['product_title'] ?? $item['title'] ?? ''),
            'price' => (int) ($item['selling_price'] ?? data_get($item, 'price.selling_price') ?? $item['price'] ?? 0),
            'stock' => (int) ($item['seller_stock'] ?? $item['marketplace_seller_stock'] ?? $item['selling_stock'] ?? 0),
            'sku' => (string) ($item['supplier_code'] ?? $item['sku'] ?? ''),
        ];
    }

    public function searchProducts(string $keyword = '', int $page = 1): array
    {
        $query = ['page' => max(1, $page), 'size' => 50];
        $keyword = trim($keyword);
        if ($keyword !== '') {
            $dkp = self::parseProductId($keyword);
            if ($dkp !== '' && preg_match('/^dkp/i', $keyword)) {
                $query['search[product_id]'] = $dkp;
            } else {
                $query['search[search]'] = $keyword;
            }
        }
        $res = $this->request('GET', self::VARIANTS, null, $query);

        return array_map(fn ($i) => $this->variantRow($i), $this->listFrom($res, ['data.items', 'data']));
    }

    // ── Price / stock ───────────────────────────────────────────────────

    protected function variantIdOf(MarketplaceProductMap $map): int
    {
        $id = (int) ($map->remote_variant_id ?: 0);
        if ($id <= 0) {
            $this->fail(__('marketplace.digikala_variant_not_mapped'));
        }

        return $id;
    }

    public function pushPrice(MarketplaceProductMap $map, int $price): void
    {
        $variantId = $this->variantIdOf($map);
        if ($price <= 0) {
            return;
        }
        $credit = max(0, (int) ($this->credentials()['credit_increase_percentage'] ?? 0));
        try {
            $this->request('PATCH', self::SELLING_PRICE, [
                'variant_id' => $variantId,
                'selling_price' => $price,
                'credit_increase_percentage' => $credit,
            ]);
        } catch (MarketplaceException $e) {
            if (in_array($e->status, [401, 403, 422, 429], true)) {
                throw $e;
            }
            $this->request('POST', self::BATCH_VARIANT_UPDATE, [
                'deadline' => 300,
                'items' => [['variant_id' => $variantId, 'payload' => ['selling_price' => $price]]],
            ]);
        }
    }

    public function pushStock(MarketplaceProductMap $map, int $stock): void
    {
        $this->request('POST', self::BATCH_STOCK, [
            'deadline' => 300,
            'items' => [['variant_id' => $this->variantIdOf($map), 'payload' => ['seller_stock' => max(0, $stock)]]],
        ]);
    }

    // ── DKP mapping ─────────────────────────────────────────────────────

    public static function parseProductId(string $raw): string
    {
        $raw = (string) preg_replace('/\s+/', '', strtoupper(trim($raw)));
        if (preg_match('#DKP-?(\d+)#', $raw, $m)) {
            return $m[1];
        }

        return preg_match('/^\d+$/', $raw) ? $raw : '';
    }

    /**
     * Seller variants of one DKP, labelled with color/size from the public product API.
     *
     * @return list<array<string, mixed>>
     */
    public function variantsForDkp(string $dkp): array
    {
        $productId = self::parseProductId($dkp);
        if ($productId === '') {
            $this->fail(__('marketplace.digikala_invalid_dkp'));
        }
        $res = $this->request('GET', self::VARIANTS, null, ['search[search_term]' => $productId, 'size' => 50, 'page' => 1]);
        $rows = [];
        foreach ($this->listFrom($res, ['data.items', 'data']) as $item) {
            $row = $this->variantRow($item);
            $row['product_id'] = $row['id'] !== '' ? $row['id'] : $productId;
            $rows[] = $row;
        }
        $attrs = $this->publicVariantAttrs($productId);
        foreach ($rows as &$row) {
            $meta = $attrs[$row['variant_id']] ?? null;
            if (! $meta) {
                continue;
            }
            $row['color'] = $meta['color'] ?? '';
            $row['size'] = $meta['size'] ?? '';
            $label = implode(' · ', array_filter([$meta['color'] ?? '', $meta['size'] ?? '']));
            if ($label !== '') {
                $row['label'] = $label;
            }
            if (($row['title'] ?? '') === '' && ! empty($meta['title'])) {
                $row['title'] = $meta['title'];
            }
        }
        unset($row);

        return $rows;
    }

    /** @return array<string, array{color?: string, size?: string, title?: string}> Cached 15 minutes. */
    public function publicVariantAttrs(string $productId): array
    {
        $productId = self::parseProductId($productId);
        if ($productId === '') {
            return [];
        }

        return Cache::remember('marketplace:digikala:pub:'.$productId, 900, function () use ($productId) {
            $out = [];
            try {
                $res = Http::timeout(12)->acceptJson()->withHeaders(['User-Agent' => 'WebinoDashboard/1.0'])
                    ->get('https://api.digikala.com/v2/product/'.rawurlencode($productId).'/');
                $product = $res->ok() ? (array) data_get($res->json(), 'data.product', []) : [];
                foreach ((array) ($product['variants'] ?? []) as $v) {
                    if (! is_array($v) || empty($v['id'])) {
                        continue;
                    }
                    $out[(string) $v['id']] = array_filter([
                        'color' => (string) data_get($v, 'color.title', ''),
                        'size' => (string) data_get($v, 'size.title', ''),
                        'title' => (string) ($v['title'] ?? $product['title_fa'] ?? ''),
                    ]);
                }
            } catch (Throwable) {
            }

            return $out;
        });
    }

    /**
     * Map a DKP onto a product/variant; the Digikala variant is auto-picked when unique.
     *
     * @return array{map: MarketplaceProductMap, dk_product_id: string, dk_variant_id: string, variants: list<array<string, mixed>>, needs_variant: bool}
     */
    public function resolveAndMap(Product $product, ?ProductVariant $variant, string $dkp, string $variantId = ''): array
    {
        $productId = self::parseProductId($dkp);
        if ($productId === '') {
            $this->fail(__('marketplace.digikala_invalid_dkp'));
        }
        $variants = $this->variantsForDkp($productId);
        $chosen = trim($variantId);
        if ($chosen === '' && count($variants) === 1) {
            $chosen = (string) $variants[0]['variant_id'];
        }
        $picked = collect($variants)->firstWhere('variant_id', $chosen);
        $map = MarketplaceProductMap::query()->updateOrCreate(
            ['product_id' => $product->id, 'variant_key' => (int) ($variant?->id ?? 0), 'platform' => 'digikala'],
            [
                'tenant_id' => $product->tenant_id,
                'product_variant_id' => $variant?->id,
                'remote_product_id' => $productId,
                'remote_variant_id' => $chosen !== '' ? $chosen : null,
                'remote_url' => 'https://www.digikala.com/product/dkp-'.$productId.'/',
                'sync_enabled' => $chosen !== '',
                'meta' => array_filter([
                    'label' => $picked['label'] ?? null,
                    'title' => $picked['title'] ?? null,
                ]),
            ]
        );
        $this->logInfo('product', 'DKP mapped', ['product_id' => $product->id, 'variant_id' => $variant?->id, 'dkp' => $productId, 'dk_variant_id' => $chosen]);

        return [
            'map' => $map,
            'dk_product_id' => $productId,
            'dk_variant_id' => $chosen,
            'variants' => $variants,
            'needs_variant' => $chosen === '' && count($variants) > 1,
        ];
    }

    /** @return array<string, array<string, mixed>> Keyed by Digikala variant id. */
    public function labelsForProduct(Product $product): array
    {
        $out = [];
        $maps = MarketplaceProductMap::query()->where('product_id', $product->id)->where('platform', 'digikala')->get();
        foreach ($maps as $m) {
            $pid = (string) $m->remote_product_id;
            $vid = (string) $m->remote_variant_id;
            if ($pid === '' || $vid === '') {
                continue;
            }
            $meta = $this->publicVariantAttrs($pid)[$vid] ?? [];
            $label = implode(' · ', array_filter([$meta['color'] ?? '', $meta['size'] ?? '']));
            $out[$vid] = [
                'variant_id' => $vid,
                'product_id' => $pid,
                'product_variant_id' => $m->product_variant_id,
                'title' => $meta['title'] ?? '',
                'color' => $meta['color'] ?? '',
                'size' => $meta['size'] ?? '',
                'label' => $label !== '' ? $label : ($meta['title'] ?? ''),
            ];
        }

        return $out;
    }

    // ── Orders ──────────────────────────────────────────────────────────

    /**
     * Active + history (processed/returned/canceled) + ship-by-seller orders, grouped per Digikala order.
     *
     * @return list<array<string, mixed>>
     */
    public function pullOrders(array $args = []): array
    {
        $max = max(1, min(20, (int) ($args['max_pages'] ?? 8)));
        $groups = [];
        $this->collectActive($groups, $max);
        $this->collectHistory($groups, $max);
        $this->collectSbs($groups, $max);

        $out = [];
        foreach ($groups as $id => $bundle) {
            $out[] = array_merge($bundle, ['id' => (string) $id]);
        }

        return $out;
    }

    /** @return array{items: list<array<string, mixed>>, fulfillment: string, native_status: string, shipment_id: string, sbs: array<string, mixed>} */
    protected static function emptyBundle(string $fulfillment, string $status): array
    {
        return ['items' => [], 'fulfillment' => $fulfillment, 'native_status' => $status, 'shipment_id' => '', 'sbs' => []];
    }

    /** @param  array<string, mixed>  $item */
    protected static function itemOrderId(array $item): string
    {
        return (string) ($item['order_id'] ?? $item['id'] ?? '');
    }

    /** @param  array<string, array<string, mixed>>  $groups */
    protected function collectActive(array &$groups, int $max): void
    {
        for ($page = 1; $page <= $max; $page++) {
            try {
                $res = $this->request('GET', self::ORDERS, null, ['page' => $page, 'size' => 50]);
            } catch (MarketplaceException $e) {
                if ($page === 1) {
                    throw $e;
                }

                return;
            }
            $items = $this->listFrom($res, ['data.items']);
            if (! $items) {
                return;
            }
            foreach ($items as $item) {
                $id = self::itemOrderId($item);
                if ($id === '') {
                    continue;
                }
                $groups[$id] ??= self::emptyBundle('digikala', 'active');
                $groups[$id]['items'][] = $item;
                if (! empty($item['warehouse_status_at'])) {
                    $groups[$id]['native_status'] = 'warehouse';
                }
            }
        }
    }

    /** @param  array<string, array<string, mixed>>  $groups */
    protected function collectHistory(array &$groups, int $max): void
    {
        foreach (['processed', 'returned', 'canceled'] as $type) {
            for ($page = 1; $page <= $max; $page++) {
                try {
                    $res = $this->request('GET', self::ORDERS_HISTORY, null, ['page' => $page, 'size' => 50, 'order_type' => $type]);
                } catch (MarketplaceException) {
                    break;
                }
                $items = $this->listFrom($res, ['data.items']);
                if (! $items) {
                    break;
                }
                foreach ($items as $item) {
                    $id = self::itemOrderId($item);
                    if ($id === '') {
                        continue;
                    }
                    $groups[$id] ??= self::emptyBundle('digikala', $type);
                    $groups[$id]['items'][] = $item;
                    $groups[$id]['native_status'] = $type;
                }
            }
        }
    }

    /** @param  array<string, array<string, mixed>>  $groups */
    protected function collectSbs(array &$groups, int $max): void
    {
        for ($page = 1; $page <= $max; $page++) {
            try {
                $res = $this->request('GET', self::SBS_ORDERS, null, ['page' => $page, 'size' => 50]);
            } catch (MarketplaceException) {
                return;
            }
            $ships = $this->listFrom($res, ['data.items', 'data']);
            if (! $ships) {
                return;
            }
            foreach ($ships as $ship) {
                $shipmentId = (string) ($ship['id'] ?? $ship['order_shipment_id'] ?? $ship['shipment_id'] ?? '');
                $status = Str::snake((string) ($ship['status'] ?? $ship['shipment_status'] ?? '')) ?: 'processing';
                $lines = array_values(array_filter((array) ($ship['order_items'] ?? $ship['items'] ?? $ship['variants'] ?? []), 'is_array'));
                $id = (string) ($ship['order_id'] ?? '');
                if ($id === '' && $lines) {
                    $id = self::itemOrderId($lines[0]);
                }
                if ($id === '' && $shipmentId !== '') {
                    $id = 'sbs-'.$shipmentId;
                }
                if ($id === '') {
                    continue;
                }
                $groups[$id] ??= self::emptyBundle('seller', $status);
                $groups[$id]['fulfillment'] = 'seller';
                $groups[$id]['shipment_id'] = $shipmentId;
                $groups[$id]['native_status'] = $status;
                $groups[$id]['sbs'] = array_diff_key($ship, ['order_items' => 1, 'items' => 1, 'variants' => 1]);
                $groups[$id]['items'] = $lines ?: [$ship];
            }
        }
    }

    public function getOrder(string $remoteId): ?array
    {
        return null;
    }

    public function normalizeOrder(array $raw): array
    {
        if (! array_key_exists('native_status', $raw)) {
            return OrderNormalizer::normalize('digikala', $raw);
        }
        $items = [];
        foreach ((array) ($raw['items'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $qty = max(1, (int) ($line['quantity'] ?? $line['count'] ?? 1));
            $unit = (float) ($line['selling_price'] ?? $line['price'] ?? 0);
            if ($unit <= 0 && isset($line['total_price'])) {
                $unit = (float) $line['total_price'] / $qty;
            }
            $items[] = [
                'product_id' => (string) ($line['product_id'] ?? data_get($line, 'product.id') ?? ''),
                'variant_id' => (string) ($line['product_variant_id'] ?? $line['variant_id'] ?? data_get($line, 'variant.id') ?? ''),
                'title' => (string) ($line['product_variant_title'] ?? $line['product_title'] ?? $line['title'] ?? ''),
                'quantity' => $qty,
                'price' => $unit,
            ];
        }
        $sbs = (array) ($raw['sbs'] ?? []);
        $first = is_array($raw['items'][0] ?? null) ? $raw['items'][0] : [];
        $customerSrc = (array) ($sbs['customer'] ?? $sbs['buyer'] ?? $first['customer'] ?? []);

        return [
            'id' => (string) $raw['id'],
            'status' => (string) $raw['native_status'],
            'items' => $items,
            'customer' => OrderNormalizer::customer($customerSrc, $sbs ?: $first),
            'raw' => $raw,
        ];
    }

    public function mapOrderStatus(string $remoteStatus): string
    {
        $n = strtolower($remoteStatus);
        if (str_contains($n, 'cancel')) {
            return 'cancelled';
        }
        if (str_contains($n, 'return')) {
            return 'refunded';
        }
        if (in_array($n, ['processed', 'completed', 'delivered', 'full_delivered_to_customer', 'full_delivered'], true)) {
            return 'completed';
        }

        return 'processing';
    }

    /**
     * Fulfillment mode and Digikala data kept on the order (refreshed on every pull).
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function orderExtra(array $raw): array
    {
        if (! array_key_exists('native_status', $raw)) {
            return [];
        }

        return [
            'fulfillment' => (string) ($raw['fulfillment'] ?? 'digikala'),
            'meta' => [
                'digikala' => [
                    'order_id' => (string) ($raw['id'] ?? ''),
                    'fulfillment' => (string) ($raw['fulfillment'] ?? 'digikala'),
                    'native_status' => (string) ($raw['native_status'] ?? ''),
                    'shipment_id' => (string) ($raw['shipment_id'] ?? ''),
                    'items' => array_values(array_map(fn ($i) => array_intersect_key((array) $i, array_flip([
                        'id', 'order_item_id', 'order_id', 'product_id', 'product_variant_id', 'variant_id',
                        'product_variant_title', 'product_title', 'title', 'quantity', 'count', 'selling_price', 'status',
                    ])), (array) ($raw['items'] ?? []))),
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    protected function orderData(Order $order): array
    {
        return (array) (($order->meta ?? [])['digikala'] ?? []);
    }

    /**
     * SBS status push (update-status with optional verification code). Digikala-fulfilled orders
     * cannot receive seller statuses; those are logged and skipped.
     *
     * @return array<string, mixed>
     */
    public function pushOrderStatus(Order $order, string $action, string $verificationCode = '', bool $strict = true): array
    {
        $action = Str::snake(strtolower(trim($action)));
        if (in_array($action, ['cancelled', 'canceled', 'cancel'], true)) {
            return $this->cancelItems($order, []);
        }
        $dk = $this->orderData($order);
        $shipmentId = (string) ($dk['shipment_id'] ?? '');
        if (($dk['fulfillment'] ?? '') !== 'seller' && $shipmentId === '') {
            $this->logInfo('orders', 'DK-fulfilled status push skipped (use cancel-item)', ['order_id' => $order->id, 'status' => $action]);

            return ['skipped' => 'warehouse'];
        }
        $next = match ($action) {
            'processing' => 'processing',
            'processed' => 'processed',
            'completed', 'full_delivered_to_customer', 'full_delivered' => 'full_delivered_to_customer',
            default => '',
        };
        if ($next === '') {
            if ($strict) {
                $this->fail(__('marketplace.digikala_invalid_sbs_status'));
            }

            return ['skipped' => 'status'];
        }
        $body = ['order_shipment_id' => (int) $shipmentId, 'new_status' => $next];
        if ($verificationCode !== '') {
            $body['verification_code'] = (int) $verificationCode;
        }
        $this->request('PUT', self::SBS_UPDATE_STATUS, $body);
        $dk['native_status'] = $next;
        $meta = $order->meta ?? [];
        $meta['digikala'] = $dk;
        $meta['marketplace']['remote_status'] = $next;
        $order->update(['meta' => $meta]);
        MarketplaceOrderMap::query()->where('order_id', $order->id)->where('platform', 'digikala')->update(['status' => $next]);
        $this->logInfo('orders', 'SBS status pushed', ['order_id' => $order->id, 'status' => $next]);

        return ['status' => $next];
    }

    /**
     * SBS: cancel-item on the shipment. Digikala-fulfilled: DELETE orders/{item} per order item.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function cancelItems(Order $order, array $payload): array
    {
        $reason = (int) ($payload['cancellation_reason_id'] ?? $payload['reason_id'] ?? -1);
        $count = (int) ($payload['count'] ?? 0);
        $dk = $this->orderData($order);
        $items = (array) ($dk['items'] ?? []);
        $shipmentId = (string) ($dk['shipment_id'] ?? '');

        if (($dk['fulfillment'] ?? '') === 'seller' && $shipmentId !== '') {
            $itemId = (int) ($payload['item_id'] ?? 0);
            if ($itemId <= 0 && $items) {
                $itemId = (int) ($items[0]['id'] ?? $items[0]['order_item_id'] ?? 0);
            }
            $this->request('POST', self::SBS_CANCEL_ITEM, [
                'order_shipment_id' => (int) $shipmentId,
                'item_id' => $itemId,
                'reason_id' => $reason > 0 ? $reason : 1,
                'count' => max(1, $count),
            ]);
            $this->logInfo('orders', 'SBS item cancelled', ['order_id' => $order->id, 'item_id' => $itemId]);

            return ['cancelled' => 1];
        }

        $only = (int) ($payload['item_id'] ?? 0);
        $done = 0;
        $errors = [];
        foreach ($items as $item) {
            $itemId = (int) ($item['id'] ?? $item['order_item_id'] ?? 0);
            if ($itemId <= 0 || ($only > 0 && $itemId !== $only)) {
                continue;
            }
            $body = ['cancellation_reason_id' => $reason];
            if ($count > 0) {
                $body['count'] = $count;
            }
            try {
                $this->request('DELETE', self::ORDERS.'/'.$itemId, $body);
                $done++;
            } catch (MarketplaceException $e) {
                $errors[] = $e->getMessage();
            }
        }
        if ($errors && $done === 0) {
            $this->fail(implode(' | ', $errors));
        }
        $this->logInfo('orders', 'Order items cancelled', ['order_id' => $order->id, 'cancelled' => $done]);

        return ['cancelled' => $done, 'errors' => $errors];
    }

    // ── Webhooks ────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function subscribeWebhooks(): array
    {
        $enabled = DigikalaWebhooks::normalizeEvents($this->credentials()['webhook_events'] ?? null);
        $events = [];
        foreach ($enabled as $key => $on) {
            if ($on && isset(DigikalaWebhooks::OFFICIAL[$key])) {
                $events[] = DigikalaWebhooks::OFFICIAL[$key];
            }
        }
        $events = array_values(array_unique($events));
        try {
            $types = $this->request('GET', self::WEBHOOK_EVENTS);
        } catch (MarketplaceException) {
            $types = [];
        }
        $url = DigikalaWebhooks::webhookUrl($this->tenantId);
        $res = $this->request('POST', self::WEBHOOK_SUBSCRIBE, [
            'url' => $url,
            'callback_url' => $url,
            'events' => $events,
            'event_types' => $events,
        ]);
        $this->putState(['webhook_subscribed_at' => now()->toIso8601String(), 'webhook_events' => $events]);
        $this->logInfo('webhook', 'Official webhook subscription saved', ['events' => $events]);

        return ['events' => $events, 'event_types' => $types['data'] ?? $types, 'url' => $url, 'result' => $res['data'] ?? null];
    }

    // ── Jobs ────────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function runJob(string $type, array $payload): array
    {
        return match ($type) {
            'dk_order_status' => $this->pushOrderStatus(
                $this->jobOrder($payload),
                (string) ($payload['action'] ?? $payload['status'] ?? ''),
                (string) ($payload['verification_code'] ?? ''),
                (bool) ($payload['strict'] ?? true),
            ),
            'dk_order_cancel' => $this->cancelItems($this->jobOrder($payload), $payload),
            'dk_product_import' => $this->importProducts((string) ($payload['keyword'] ?? '')),
            'dk_auto_link' => $this->autoLink(),
            'dk_reconcile' => $this->reconcile((string) ($payload['type'] ?? 'all')),
            DigikalaWebhooks::JOB_INVENTORY => $this->inventoryFromWebhook($payload),
            DigikalaWebhooks::JOB_NOTICE => $this->notice($payload),
            default => throw new MarketplaceException("Unknown Digikala job [{$type}]", 422),
        };
    }

    /** @param  array<string, mixed>  $payload */
    protected function jobOrder(array $payload): Order
    {
        $order = Order::query()->where('tenant_id', $this->tenantId)->find((int) ($payload['order_id'] ?? 0));
        if (! $order) {
            $this->fail(__('marketplace.digikala_order_not_found'), 404);
        }

        return $order;
    }

    /**
     * Push mapped variants touched by a webhook (or all maps when the payload has no variant).
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function inventoryFromWebhook(array $payload): array
    {
        $body = (array) ($payload['payload'] ?? []);
        $variantId = (string) (data_get($body, 'data.variant_id') ?? data_get($body, 'variant_id') ?? data_get($body, 'data.id') ?? '');
        $sync = app(MarketplaceSync::class);
        if ($variantId === '') {
            return $sync->syncAll($this->tenantId, 'digikala');
        }
        $ok = 0;
        $maps = MarketplaceProductMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')
            ->where('remote_variant_id', $variantId)->where('sync_enabled', true)->get();
        foreach ($maps as $map) {
            $sync->pushMap($map->id);
            $ok++;
        }

        return ['variant_id' => $variantId, 'pushed' => $ok];
    }

    /** @param  array<string, mixed>  $payload */
    protected function notice(array $payload): array
    {
        $this->logInfo((string) ($payload['context'] ?? 'webhook'), 'Digikala event: '.($payload['event'] ?? ''), ['payload' => $payload['payload'] ?? null]);

        return ['logged' => true];
    }

    /**
     * Create draft products from Digikala product-creation search and map them by DKP.
     *
     * @return array{created: int, skipped: int}
     */
    public function importProducts(string $keyword): array
    {
        $res = $this->request('GET', self::PRODUCT_SEARCH, null, ['search[keyword]' => trim($keyword) !== '' ? trim($keyword) : ' ']);
        $pricing = MarketplacePricing::forTenant($this->tenantId);
        $created = 0;
        $skipped = 0;
        foreach (array_slice($this->listFrom($res, ['data.items', 'data']), 0, 50) as $item) {
            $title = trim((string) ($item['title'] ?? $item['title_fa'] ?? ''));
            $dkId = (string) ($item['id'] ?? '');
            if ($title === '' || $dkId === '') {
                $skipped++;

                continue;
            }
            $exists = MarketplaceProductMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')
                ->where('remote_product_id', $dkId)->exists();
            if ($exists) {
                $skipped++;

                continue;
            }
            $product = Product::query()->create([
                'tenant_id' => $this->tenantId,
                'name' => $title,
                'slug' => Str::slug('dk-'.$dkId.'-'.Str::random(4)),
                'sku' => 'dk-'.$dkId,
                'price_minor' => $pricing->fromRemote((float) ($item['market_price'] ?? $item['price'] ?? 0), 'digikala'),
                'currency' => $pricing->storeCurrency(),
                'status' => 'draft',
                'stock' => 0,
                'manage_stock' => true,
            ]);
            MarketplaceProductMap::query()->create([
                'tenant_id' => $this->tenantId,
                'product_id' => $product->id,
                'platform' => 'digikala',
                'remote_product_id' => $dkId,
                'remote_url' => 'https://www.digikala.com/product/dkp-'.$dkId.'/',
                'sync_enabled' => false,
            ]);
            $created++;
        }
        $this->logInfo('product', 'Product import done', ['created' => $created, 'skipped' => $skipped]);

        return ['created' => $created, 'skipped' => $skipped];
    }

    /**
     * Link unmapped products/variants whose SKU exactly matches a Digikala supplier code.
     *
     * @return array{linked: int, checked: int}
     */
    public function autoLink(): array
    {
        $mapped = MarketplaceProductMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')
            ->get(['product_id', 'variant_key'])->map(fn ($m) => $m->product_id.':'.$m->variant_key)->flip();
        $linked = 0;
        $checked = 0;
        $targets = [];
        Product::query()->where('tenant_id', $this->tenantId)->with('variants:id,product_id,sku')->orderBy('id')
            ->chunkById(200, function ($products) use (&$targets, $mapped) {
                foreach ($products as $p) {
                    if ($p->variants->isEmpty()) {
                        if (filled($p->sku) && ! isset($mapped[$p->id.':0'])) {
                            $targets[] = [$p, null, (string) $p->sku];
                        }

                        continue;
                    }
                    foreach ($p->variants as $v) {
                        if (filled($v->sku) && ! isset($mapped[$p->id.':'.$v->id])) {
                            $targets[] = [$p, $v, (string) $v->sku];
                        }
                    }
                }
            });
        foreach (array_slice($targets, 0, 200) as [$product, $variant, $sku]) {
            $checked++;
            try {
                $found = $this->searchProducts($sku);
            } catch (MarketplaceException $e) {
                if ($e->isRateLimited() || $e->isAuthError()) {
                    throw $e;
                }

                continue;
            }
            $match = collect($found)->first(fn ($f) => $f['sku'] !== '' && strcasecmp($f['sku'], $sku) === 0);
            if (! $match || $match['variant_id'] === '') {
                continue;
            }
            MarketplaceProductMap::query()->updateOrCreate(
                ['product_id' => $product->id, 'variant_key' => (int) ($variant?->id ?? 0), 'platform' => 'digikala'],
                [
                    'tenant_id' => $this->tenantId,
                    'product_variant_id' => $variant?->id,
                    'remote_product_id' => $match['id'] ?: null,
                    'remote_variant_id' => $match['variant_id'],
                    'remote_url' => $match['id'] ? 'https://www.digikala.com/product/dkp-'.$match['id'].'/' : null,
                    'sync_enabled' => true,
                ]
            );
            $linked++;
        }
        $this->logInfo('product', 'Auto-link by SKU finished', ['linked' => $linked, 'checked' => $checked]);

        return ['linked' => $linked, 'checked' => $checked];
    }

    /**
     * Drift report between local data and Digikala maps (products, orders, inventory).
     *
     * @return array<string, mixed>
     */
    public function reconcile(string $type = 'all'): array
    {
        $out = [];
        if (in_array($type, ['all', 'products'], true)) {
            $maps = MarketplaceProductMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')->with(['product:id', 'variant:id'])->get();
            $out['products'] = [
                'maps' => $maps->count(),
                'drift' => $maps->filter(fn ($m) => ! $m->product || ($m->product_variant_id && ! $m->variant) || blank($m->remote_product_id))->count(),
                'missing_variant' => $maps->filter(fn ($m) => blank($m->remote_variant_id))->count(),
            ];
        }
        if (in_array($type, ['all', 'orders'], true)) {
            $maps = MarketplaceOrderMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')->with('order:id')->get();
            $out['orders'] = ['maps' => $maps->count(), 'drift' => $maps->filter(fn ($m) => ! $m->order)->count()];
        }
        if (in_array($type, ['all', 'inventory'], true)) {
            $pricing = MarketplacePricing::forTenant($this->tenantId);
            $maps = MarketplaceProductMap::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')
                ->whereNotNull('remote_stock')->with(['product', 'variant'])->get();
            $out['inventory'] = [
                'checked' => $maps->count(),
                'drift' => $maps->filter(fn ($m) => $m->product && $pricing->stockFor($m->product, $m->variant) !== (int) $m->remote_stock)->count(),
            ];
        }
        if ($out === []) {
            $this->fail(__('marketplace.digikala_bad_reconcile'), 400);
        }
        $this->logInfo('reconcile', 'Reconciliation finished', $out);
        $this->putState(['last_reconcile' => array_merge($out, ['at' => now()->toIso8601String()])]);

        return $out;
    }

    /** @return array{status: string, auth_ok: bool, queue_pending: int, queue_running: int, errors_24h: int, checked_at: string, last_reconcile: mixed, webhook_subscribed_at: mixed} */
    public function health(): array
    {
        $jobs = MarketplaceJob::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala');
        $pending = (clone $jobs)->whereIn('status', ['pending', 'retrying'])->count();
        $running = (clone $jobs)->where('status', 'running')->count();
        $errors = MarketplaceLog::query()->where('tenant_id', $this->tenantId)->where('platform', 'digikala')
            ->where('level', 'error')->where('created_at', '>=', now()->subDay())->count();
        try {
            $this->auth()->accessToken();
            $authOk = true;
        } catch (Throwable) {
            $authOk = false;
        }
        $status = 'healthy';
        if (! $authOk || $errors > 30) {
            $status = 'critical';
        } elseif ($errors > 5 || $pending > 50) {
            $status = 'warning';
        }
        $state = $this->state();

        return [
            'status' => $status,
            'auth_ok' => $authOk,
            'queue_pending' => $pending,
            'queue_running' => $running,
            'errors_24h' => $errors,
            'checked_at' => now()->toIso8601String(),
            'last_reconcile' => $state['last_reconcile'] ?? null,
            'webhook_subscribed_at' => $state['webhook_subscribed_at'] ?? null,
        ];
    }

    /** @return list<array{level: string, code: string}> */
    public static function alertsFor(array $health): array
    {
        $alerts = [];
        if (empty($health['auth_ok'])) {
            $alerts[] = ['level' => 'critical', 'code' => 'auth'];
        }
        if ((int) ($health['errors_24h'] ?? 0) > 5) {
            $alerts[] = ['level' => 'warning', 'code' => 'errors'];
        }
        if ((int) ($health['queue_pending'] ?? 0) > 50) {
            $alerts[] = ['level' => 'warning', 'code' => 'backlog'];
        }

        return $alerts;
    }
}
