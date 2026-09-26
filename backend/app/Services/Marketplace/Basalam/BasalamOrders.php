<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\MarketplaceOrderMap;
use App\Models\Order;
use App\Models\OrderNote;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceOrderImporter;
use App\Services\Marketplace\MarketplacePricing;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;

/**
 * Basalam orders (port of OrderManager, FetchOrders/SyncOrder and the order action services):
 * invoice detail import, webhook events, parcel polling, confirm / cancel / cancel-request / delay /
 * tracking and auto-confirm.
 */
class BasalamOrders
{
    public const JOB_EVENT = 'bs_order_event';

    public const JOB_FETCH = 'sync_basalam_fetch_orders';

    public const PLACEHOLDER = 'این محصول در سایت شما تعریف نشده است ، برای مشاهده جزییات به باسلام مراجعه کنید';

    /** Basalam status id => normalized key (stored as the remote status). */
    public const STATUS_KEYS = [
        BasalamEndpoints::STATUS_REJECTED => 'rejected',
        BasalamEndpoints::STATUS_WAIT_VENDOR => 'wait-vendor',
        BasalamEndpoints::STATUS_PREPARATION => 'preparation',
        BasalamEndpoints::STATUS_SHIPPING => 'shipping',
        BasalamEndpoints::STATUS_COMPLETED => 'completed',
        BasalamEndpoints::STATUS_CANCELLED => 'rejected',
    ];

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    /** @return array<string, mixed> */
    protected function engine(): array
    {
        return (new BasalamSettings(app(MarketplaceSettingsService::class)))->engine($this->tid());
    }

    public static function clampDays(mixed $raw, int $default = 90): int
    {
        $days = (int) $raw;

        return $days < 1 || $days > 365 ? $default : $days;
    }

    // ── Remote reads ────────────────────────────────────────────────────

    /** @return array<string, mixed> Invoice detail (order-processing v2). */
    public function detail(int $invoiceId): array
    {
        $data = $this->client->get(sprintf(BasalamEndpoints::ORDER_DETAIL, $this->client->vendorId(), $invoiceId));
        if ($data === []) {
            throw new MarketplaceException(__('marketplace.basalam_order_empty', ['id' => $invoiceId]), 502);
        }
        if (isset($data['data']) && is_array($data['data']) && isset($data['data']['items'])) {
            $data = $data['data'];
        }

        return $data;
    }

    /**
     * One page of vendor parcels created in the last `$day` days.
     *
     * @return array{orders: list<array<string, mixed>>, next_cursor: ?string}
     */
    public function fetchPage(int $day = 7, ?string $cursor = null): array
    {
        $query = ['per_page' => 10, 'created_at[gte]' => gmdate('c', time() - $day * 86400)];
        if ($cursor) {
            $query['cursor'] = $cursor;
        }
        $body = $this->client->get(BasalamEndpoints::VENDOR_PARCELS, $query);
        if (! isset($body['data']) || ! is_array($body['data'])) {
            throw new MarketplaceException(__('marketplace.basalam_parcels_invalid'), 502);
        }
        $next = $body['next_cursor'] ?? null;

        return ['orders' => array_values(array_filter($body['data'], 'is_array')), 'next_cursor' => $next ? (string) $next : null];
    }

    // ── Normalization ───────────────────────────────────────────────────

    public static function statusKey(mixed $statusId): string
    {
        return self::STATUS_KEYS[(int) $statusId] ?? 'wait-vendor';
    }

    /** Rial amount → the platform remote unit configured in marketplace pricing. */
    protected function rialToRemote(float $rial): float
    {
        return MarketplacePricing::forTenant($this->tid())->unit('basalam') === 'toman' ? $rial / 10 : $rial;
    }

    protected function rialToStore(float $rial): int
    {
        $pricing = MarketplacePricing::forTenant($this->tid());

        return (int) round($pricing->storeCurrency() === 'IRT' ? $rial / 10 : $rial);
    }

    /** @param  array<string, mixed>  $item */
    public static function lineTotalRial(array $item): int
    {
        foreach ((array) data_get($item, 'financial_report.report_items', []) as $row) {
            if (is_array($row) && ($row['title'] ?? '') === 'قیمت محصول' && isset($row['amount'])) {
                return (int) $row['amount'];
            }
        }

        return 0;
    }

    /**
     * @param  array<string, mixed>  $raw  Invoice detail (or a polled parcel wrapper without customer_data).
     * @return array{id: string, status: string, items: list<array<string, mixed>>, customer: array<string, string>, raw: array<string, mixed>}
     */
    public function normalize(array $raw): array
    {
        $id = (string) ($raw['invoice_id'] ?? $raw['id'] ?? '');
        if (! isset($raw['customer_data']) && ! isset($raw['financial_report'])) {
            return ['id' => $id, 'status' => '', 'items' => [], 'customer' => [], 'raw' => $raw];
        }
        $engine = $this->engine();
        $items = [];
        foreach ((array) ($raw['items'] ?? []) as $item) {
            if (! is_array($item) || empty(data_get($item, 'product.id'))) {
                continue;
            }
            $qty = max(1, (int) ($item['quantity'] ?? 1));
            $total = self::lineTotalRial($item);
            $items[] = [
                'product_id' => (string) data_get($item, 'product.id'),
                'variant_id' => (string) (data_get($item, 'variation.id') ?? ''),
                'title' => (string) (data_get($item, 'product.title') ?? $item['title'] ?? '') ?: self::PLACEHOLDER,
                'quantity' => $qty,
                'price' => $total > 0 ? $this->rialToRemote($total / $qty) : $this->rialToRemote((float) (data_get($item, 'product.price') ?? 0)),
            ];
        }

        $recipient = (array) data_get($raw, 'customer_data.recipient', []);
        $full = trim((string) ($recipient['name'] ?? ''));
        $parts = array_values(array_filter(explode(' ', $full), fn ($p) => $p !== ''));
        if (count($parts) === 1) {
            $first = $last = $parts[0];
        } else {
            $first = (string) array_shift($parts);
            $last = implode(' ', $parts);
        }
        if (($engine['customer_prefix_name'] ?? '') !== '') {
            $first = trim($engine['customer_prefix_name'].' '.$first);
        }
        if (($engine['customer_suffix_name'] ?? '') !== '') {
            $last = trim($last.' '.$engine['customer_suffix_name']);
        }

        return [
            'id' => $id,
            'status' => self::statusKey(data_get($raw, 'status.id')),
            'items' => $items,
            'customer' => [
                'name' => trim($first.' '.$last),
                'first_name' => $first,
                'last_name' => $last,
                'phone' => (string) ($recipient['mobile'] ?? ''),
                'email' => '',
                'address' => (string) ($recipient['postal_address'] ?? ''),
                'city' => (string) data_get($raw, 'customer_data.city.title', ''),
                'state' => (string) data_get($raw, 'customer_data.city.parent.title', ''),
                'postcode' => (string) ($recipient['postal_code'] ?? ''),
                'country' => 'IR',
            ],
            'raw' => $raw,
        ];
    }

    /** Local status for a normalized Basalam status key. */
    public function mapStatus(string $key): string
    {
        $woo = ($this->engine()['order_statues_type'] ?? '') === 'woocommerce_statuses';

        return match ($key) {
            'wait-vendor' => $woo ? 'processing' : 'on_hold',
            'preparation' => 'processing',
            'shipping' => 'shipped',
            'completed' => 'completed',
            'rejected' => 'cancelled',
            default => 'on_hold',
        };
    }

    /**
     * Shipping, paid flag and Basalam invoice data kept on the order.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function extra(array $raw): array
    {
        if (! isset($raw['customer_data']) && ! isset($raw['financial_report'])) {
            return [];
        }
        $engine = $this->engine();
        $shippingRial = (float) (data_get($raw, 'financial_report.shipping_submit.total.amount') ?? 0);
        $statusId = (int) data_get($raw, 'status.id');
        $key = self::statusKey($statusId);
        $method = $engine['order_shipping_method'] ?? 'basalam';

        return [
            'shipping_minor' => $this->rialToStore($shippingRial),
            'paid' => $key !== 'rejected',
            'meta' => [
                'basalam' => [
                    'invoice_id' => (string) ($raw['invoice_id'] ?? $raw['id'] ?? ''),
                    'hash_id' => (string) ($raw['hash_id'] ?? ''),
                    'status_id' => $statusId ?: null,
                    'status_key' => 'bslm-'.$key,
                    'items' => array_values(array_map(fn ($i) => [
                        'item_id' => (int) ($i['id'] ?? 0),
                        'product_id' => (int) data_get($i, 'product.id', 0),
                        'variation_id' => (int) data_get($i, 'variation.id', 0) ?: null,
                        'title' => (string) data_get($i, 'product.title', ''),
                        'quantity' => (int) ($i['quantity'] ?? 1),
                        'line_total_rial' => self::lineTotalRial((array) $i),
                    ], array_filter((array) ($raw['items'] ?? []), 'is_array'))),
                    'fee_amount' => (int) ((data_get($raw, 'financial_report.product_cost.report_items.2.amount') ?? 0) / 10),
                    'balance_amount' => (int) ((data_get($raw, 'financial_report.product_cost.total.amount') ?? 0) / 10),
                    'purchase_count' => data_get($raw, 'customer_data.purchase_count'),
                    'shipping_method' => $method === 'basalam' ? (string) data_get($raw, 'parcel_detail.shipping_method.title', '') : (string) $method,
                    'customer' => array_filter([
                        'user_id' => data_get($raw, 'customer_data.user.id'),
                        'city_id' => data_get($raw, 'customer_data.city.id'),
                        'province_id' => data_get($raw, 'customer_data.city.parent.id'),
                    ]),
                ],
            ],
        ];
    }

    // ── Import / webhook ────────────────────────────────────────────────

    protected function importer(): MarketplaceOrderImporter
    {
        return app(MarketplaceOrderImporter::class);
    }

    /** Create (or refresh) the local order for an invoice. */
    public function importInvoice(int $invoiceId): array
    {
        if ($invoiceId < 1) {
            throw new MarketplaceException(__('marketplace.basalam_invoice_required'), 422);
        }
        $existing = $this->importer()->findMap($this->tid(), 'basalam', (string) $invoiceId);
        if ($existing) {
            return ['result' => 'exists', 'order_id' => $existing->order_id];
        }
        $detail = $this->detail($invoiceId);
        $detail['invoice_id'] = $invoiceId;
        $adapter = MarketplaceAdapterRegistry::make('basalam', $this->tid());
        $result = $this->importer()->importOne($this->tid(), $adapter, array_merge($detail, ['id' => (string) $invoiceId]));
        $map = $this->importer()->findMap($this->tid(), 'basalam', (string) $invoiceId);
        if ($result === 'created') {
            MarketplaceLogger::info($this->tid(), 'basalam', 'orders', "سفارش {$invoiceId} با موفقیت ایجاد شد.", ['order_id' => $map?->order_id]);
        }

        return ['result' => $result, 'order_id' => $map?->order_id];
    }

    /** Apply a Basalam status to the local order, creating it first when unknown. */
    public function setStatus(int $invoiceId, string $key, string $note = ''): array
    {
        $map = $this->importer()->findMap($this->tid(), 'basalam', (string) $invoiceId);
        if (! $map) {
            $this->importInvoice($invoiceId);
            $map = $this->importer()->findMap($this->tid(), 'basalam', (string) $invoiceId);
        }
        if (! $map) {
            throw new MarketplaceException(__('marketplace.basalam_order_not_found'), 404);
        }
        $wasImporting = MarketplaceOrderImporter::$importing;
        MarketplaceOrderImporter::$importing = true;
        try {
            $this->importer()->updateStatus($map, $key, $this->mapStatus($key));
        } finally {
            MarketplaceOrderImporter::$importing = $wasImporting;
        }
        $order = $map->order()->first();
        if ($order) {
            $meta = $order->meta ?? [];
            $meta['basalam']['status_key'] = 'bslm-'.$key;
            $meta['marketplace']['remote_status'] = $key;
            $order->update(['meta' => $meta]);
            if ($note !== '') {
                OrderNote::query()->create(['tenant_id' => $order->tenant_id, 'order_id' => $order->id, 'body' => $note, 'is_customer' => false]);
            }
        }

        return ['order_id' => $map->order_id, 'status' => $key];
    }

    /**
     * Webhook event (queued). Event 7 = parcel type change, event 3 = status change, others = new order.
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function handleEvent(array $params): array
    {
        $event = (int) ($params['event_id'] ?? 0);
        if ($event === 7) {
            $invoice = (int) ($params['invoice_id'] ?? 0);
            $key = match ((string) ($params['type'] ?? '')) {
                'shipped' => 'shipping',
                'cancelled' => 'rejected',
                'preparation' => 'preparation',
                default => '',
            };

            return $key === '' ? ['ignored' => true] : $this->setStatus($invoice, $key);
        }
        if ($event === 3) {
            $invoice = (int) data_get($params, 'more_data.invoice_id', 0);
            $status = (int) ($params['status'] ?? 0);
            if ($status === BasalamEndpoints::STATUS_COMPLETED) {
                return $this->setStatus($invoice, 'completed');
            }
            if (in_array($status, [BasalamEndpoints::STATUS_REJECTED, BasalamEndpoints::STATUS_CANCELLED], true)) {
                return $this->setStatus($invoice, 'rejected');
            }

            return ['ignored' => true];
        }

        $result = $this->importInvoice((int) ($params['invoice_id'] ?? 0));
        $customer = array_filter([
            'payment_id' => $params['payment_id'] ?? null,
            'user_id' => $params['user_id'] ?? null,
            'city_id' => $params['city_id'] ?? null,
            'province_id' => $params['province_id'] ?? null,
        ]);
        if ($customer && ! empty($result['order_id'])) {
            $order = Order::query()->find($result['order_id']);
            if ($order) {
                $meta = $order->meta ?? [];
                $meta['basalam']['customer'] = array_merge((array) ($meta['basalam']['customer'] ?? []), $customer);
                $order->update(['meta' => $meta]);
            }
        }

        return $result;
    }

    /**
     * Polling job: import unseen parcels of one page and queue the next cursor.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function fetchJob(array $payload): array
    {
        $day = self::clampDays($payload['day'] ?? 7, 7);
        $page = $this->fetchPage($day, isset($payload['cursor']) && $payload['cursor'] !== '' ? (string) $payload['cursor'] : null);
        $synced = 0;
        $skipped = 0;
        $errors = [];
        foreach ($page['orders'] as $parcel) {
            $invoice = (int) data_get($parcel, 'order.id', 0);
            if ($invoice < 1) {
                MarketplaceLogger::warning($this->tid(), 'basalam', 'orders', 'سفارش بدون شناسه فاکتور پیدا شد', ['parcel' => $parcel['id'] ?? null]);

                continue;
            }
            if ($this->importer()->findMap($this->tid(), 'basalam', (string) $invoice)) {
                $skipped++;

                continue;
            }
            try {
                $this->importInvoice($invoice);
                $synced++;
            } catch (MarketplaceException $e) {
                if ($e->isTransient() || $e->status === 401) {
                    throw $e;
                }
                $errors[] = "سفارش {$invoice}: ".$e->getMessage();
                MarketplaceLogger::error($this->tid(), 'basalam', 'orders', "خطا در ایجاد سفارش {$invoice}: ".$e->getMessage());
            }
        }
        if ($page['next_cursor']) {
            app(MarketplaceSync::class)->enqueue($this->tid(), 'basalam', self::JOB_FETCH, ['cursor' => $page['next_cursor'], 'day' => $day], 5);
        }
        app(MarketplaceSettingsService::class)->putState($this->tid(), 'basalam', ['orders_pulled_at' => now()->toIso8601String()]);

        return [
            'synced' => $synced,
            'skipped' => $skipped,
            'errors_count' => count($errors),
            'errors' => $errors,
            'has_more_pages' => $page['next_cursor'] !== null,
            'next_cursor' => $page['next_cursor'],
        ];
    }

    // ── Actions ─────────────────────────────────────────────────────────

    public function invoiceOf(Order $order): int
    {
        $invoice = (int) (($order->meta ?? [])['basalam']['invoice_id'] ?? 0);
        if ($invoice < 1) {
            $invoice = (int) MarketplaceOrderMap::query()->where('order_id', $order->id)->where('platform', 'basalam')->value('remote_order_id');
        }
        if ($invoice < 1) {
            throw new MarketplaceException(__('marketplace.basalam_invoice_missing'), 422);
        }

        return $invoice;
    }

    /** @return list<int> */
    public function itemIds(Order $order): array
    {
        return array_values(array_filter(array_map(fn ($i) => (int) ($i['item_id'] ?? 0), (array) (($order->meta ?? [])['basalam']['items'] ?? []))));
    }

    public function confirm(Order $order): array
    {
        $invoice = $this->invoiceOf($order);
        $result = $this->client->post(BasalamEndpoints::ORDER_CONFIRM, ['order_id' => $invoice]);
        $this->setStatus($invoice, 'preparation', 'سفارش توسط ادمین تایید شد.');

        return ['result' => $result];
    }

    public function cancel(Order $order, string $description = '', int $reasonId = 3481): array
    {
        $invoice = $this->invoiceOf($order);
        $items = $this->itemIds($order);
        if ($items === []) {
            throw new MarketplaceException(__('marketplace.basalam_items_missing'), 422);
        }
        $reasonId = $reasonId > 0 ? $reasonId : 3481;
        $result = $this->client->post(BasalamEndpoints::ORDER_CANCEL, [
            'order_items' => array_map(fn ($id) => ['item_id' => $id, 'reason_id' => $reasonId, 'description' => $description], $items),
        ]);
        $this->setStatus($invoice, 'rejected', 'سفارش توسط ادمین لغو شد.');

        return ['result' => $result];
    }

    public function cancelRequest(Order $order, string $description = ''): array
    {
        $invoice = $this->invoiceOf($order);
        $items = $this->itemIds($order);
        if ($items === []) {
            throw new MarketplaceException(__('marketplace.basalam_items_missing'), 422);
        }
        $result = $this->client->post(sprintf(BasalamEndpoints::ORDER_CANCEL_REQUEST, $invoice), [
            'item_ids' => $items,
            'description' => $description,
        ]);
        $this->note($order, 'درخواست لغو سفارش به باسلام ارسال شد.'.($description !== '' ? ' ('.$description.')' : ''));

        return ['result' => $result];
    }

    public function delay(Order $order, int $days, string $description = ''): array
    {
        if ($days < 1) {
            throw new MarketplaceException(__('marketplace.basalam_delay_days'), 422);
        }
        $invoice = $this->invoiceOf($order);
        $result = $this->client->put(sprintf(BasalamEndpoints::ORDER_DELAY, $invoice), [
            'topic' => BasalamEndpoints::DELAY_TOPIC,
            'metadata' => ['postpone_days' => $days, 'description' => $description],
        ]);
        $this->note($order, "درخواست تاخیر {$days} روزه به باسلام ارسال شد.");

        return ['result' => $result];
    }

    public function tracking(Order $order, string $code, string $phone, int $method = 3197): array
    {
        $code = trim($code);
        $phone = trim($phone);
        if ($code === '') {
            throw new MarketplaceException(__('marketplace.basalam_tracking_required'), 422);
        }
        if ($phone === '') {
            throw new MarketplaceException(__('marketplace.basalam_phone_required'), 422);
        }
        $method = $method > 0 ? $method : 3197;
        $invoice = $this->invoiceOf($order);
        $meta = $order->meta ?? [];
        $meta['basalam']['tracking_code'] = $code;
        $meta['basalam']['shipping_method_id'] = $method;
        $order->update(['meta' => $meta]);
        $result = $this->client->post(BasalamEndpoints::ORDER_TRACKING, [
            'order_id' => $invoice,
            'shipping_method' => $method,
            'tracking_code' => $code,
            'phone_number' => $phone,
        ]);
        $this->setStatus($invoice, 'shipping', 'سفارش توسط ادمین ارسال شد.');

        return ['result' => $result];
    }

    public function autoConfirm(bool $active): array
    {
        $result = $this->client->put(BasalamEndpoints::ORDER_AUTO_CONFIRM_CONFIG, [[
            'title' => 'تایید خودکار همه سفارش ها',
            'key' => BasalamEndpoints::AUTO_CONFIRM_KEY,
            'is_active' => $active,
            'rules' => null,
        ]]);
        (new BasalamSettings(app(MarketplaceSettingsService::class)))->saveEngine($this->tid(), ['auto_confirm_order' => $active]);
        MarketplaceLogger::info($this->tid(), 'basalam', 'orders', $active ? 'Auto-confirm enabled' : 'Auto-confirm disabled');

        return ['auto_confirm_order' => $active, 'result' => $result];
    }

    protected function note(Order $order, string $body): void
    {
        OrderNote::query()->create(['tenant_id' => $order->tenant_id, 'order_id' => $order->id, 'body' => $body, 'is_customer' => false]);
    }
}
