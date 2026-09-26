<?php

namespace App\Services\Marketplace\Digikala;

use App\Models\Tenant;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;

/**
 * Digikala webhook event matrix, alias resolution, routing to queued jobs and
 * official subscription (port of Digikala_Phase3_Sync webhook parts).
 */
final class DigikalaWebhooks
{
    public const JOB_INVENTORY = 'dk_inventory';

    public const JOB_NOTICE = 'dk_notice';

    /**
     * Stable seller-panel event keys → Dashboard job type.
     * Catalog/finance events are logged only: WordPress routed them to fake "phase 2" jobs
     * or to a blind draft-product import.
     *
     * @var array<string, array{job: string, context: string, label_fa: string, label_en: string}>
     */
    public const MATRIX = [
        'variant_status' => ['job' => self::JOB_INVENTORY, 'context' => 'inventory', 'label_fa' => 'تغییر وضعیت تنوع کالایی', 'label_en' => 'Variant status change'],
        'order_shipping_status' => ['job' => MarketplaceSync::PULL_ORDERS, 'context' => 'orders', 'label_fa' => 'تغییر وضعیت ارسال سفارش', 'label_en' => 'Order shipping status'],
        'package_status' => ['job' => MarketplaceSync::PULL_ORDERS, 'context' => 'shipments', 'label_fa' => 'تغییر وضعیت محموله ها', 'label_en' => 'Package status change'],
        'commission' => ['job' => self::JOB_NOTICE, 'context' => 'finance', 'label_fa' => 'تغییر در کمیسیون ها', 'label_en' => 'Commission change'],
        'product_upsert' => ['job' => self::JOB_INVENTORY, 'context' => 'product', 'label_fa' => 'ساخت و ویرایش محصول', 'label_en' => 'Product create/update'],
        'brand_request' => ['job' => self::JOB_NOTICE, 'context' => 'catalog', 'label_fa' => 'درخواست برند', 'label_en' => 'Brand request'],
        'warranty_request' => ['job' => self::JOB_NOTICE, 'context' => 'catalog', 'label_fa' => 'درخواست گارانتی', 'label_en' => 'Warranty request'],
        'color_request' => ['job' => self::JOB_NOTICE, 'context' => 'catalog', 'label_fa' => 'درخواست رنگ', 'label_en' => 'Color request'],
        'size_request' => ['job' => self::JOB_NOTICE, 'context' => 'catalog', 'label_fa' => 'درخواست سایز', 'label_en' => 'Size request'],
        'order_finalized' => ['job' => MarketplaceSync::PULL_ORDERS, 'context' => 'orders', 'label_fa' => 'نهایی شدن سفارش', 'label_en' => 'Order finalized'],
        'order_item_cancelled' => ['job' => MarketplaceSync::PULL_ORDERS, 'context' => 'orders', 'label_fa' => 'لغو آیتم سفارش', 'label_en' => 'Order item cancelled'],
        'order_returned' => ['job' => MarketplaceSync::PULL_ORDERS, 'context' => 'orders', 'label_fa' => 'مرجوعی سفارش', 'label_en' => 'Order returned'],
    ];

    public const ALIASES = [
        'order.created' => 'order_finalized',
        'order.updated' => 'order_shipping_status',
        'order.cancelled' => 'order_item_cancelled',
        'shipment.updated' => 'package_status',
        'inventory.updated' => 'variant_status',
        'price.updated' => 'product_upsert',
        'promotion.updated' => 'commission',
        'voucher.updated' => 'commission',
        'sbs.order.updated' => 'order_shipping_status',
        'variant.status' => 'variant_status',
        'product.created' => 'product_upsert',
        'product.updated' => 'product_upsert',
        'order.finalized' => 'order_finalized',
        'order.returned' => 'order_returned',
        'order.item.cancelled' => 'order_item_cancelled',
        'product_variant_status_change' => 'variant_status',
        'order_shipment' => 'order_shipping_status',
        'seller_package_status_change' => 'package_status',
        'commission_change' => 'commission',
    ];

    /** Official Open API event names used for subscription. */
    public const OFFICIAL = [
        'variant_status' => 'product_variant_status_change',
        'order_shipping_status' => 'order_shipment',
        'package_status' => 'seller_package_status_change',
        'commission' => 'commission_change',
        'order_finalized' => 'order_shipment',
        'order_item_cancelled' => 'order_shipment',
        'order_returned' => 'order_shipment',
    ];

    public function __construct(
        protected MarketplaceSettingsService $settings,
        protected MarketplaceSync $sync,
    ) {}

    /** @return array<string, bool> Unknown keys dropped, missing keys default to enabled. */
    public static function normalizeEvents(mixed $raw): array
    {
        $out = array_fill_keys(array_keys(self::MATRIX), true);
        if (is_array($raw)) {
            foreach ($out as $key => $_) {
                if (array_key_exists($key, $raw)) {
                    $out[$key] = filter_var($raw[$key], FILTER_VALIDATE_BOOLEAN);
                }
            }
        }

        return $out;
    }

    public static function resolveEventKey(string $event): string
    {
        $raw = trim($event);
        if ($raw === '') {
            return '';
        }
        $lower = strtolower($raw);
        foreach ([$raw, $lower] as $candidate) {
            if (isset(self::ALIASES[$candidate])) {
                return self::ALIASES[$candidate];
            }
        }
        $key = (string) preg_replace('/_+/', '_', (string) preg_replace('/[^a-z0-9_]/', '', str_replace([' ', '-', '.'], '_', $lower)));
        if (isset(self::ALIASES[$key])) {
            return self::ALIASES[$key];
        }
        $dotted = str_replace('_', '.', $key);

        return self::ALIASES[$dotted] ?? $key;
    }

    /** @param  array<string, mixed>  $payload */
    public static function resolveFromPayload(string $event, array $payload): string
    {
        $candidates = [$event];
        foreach (['event', 'type', 'event_type', 'name'] as $field) {
            if (is_string($payload[$field] ?? null) && $payload[$field] !== '') {
                $candidates[] = $payload[$field];
            }
        }
        $fallback = '';
        foreach ($candidates as $candidate) {
            $resolved = self::resolveEventKey($candidate);
            if (isset(self::MATRIX[$resolved])) {
                return $resolved;
            }
            $fallback = $fallback ?: $resolved;
        }

        return $fallback;
    }

    /**
     * Route an inbound event to a queued job. Returns the resolved key and whether it was queued.
     *
     * @param  array<string, mixed>  $payload
     * @return array{event: string, queued: bool, job?: string, reason?: string}
     */
    public function dispatch(int $tenantId, string $event, array $payload): array
    {
        $key = self::resolveFromPayload($event, $payload);
        if (! isset(self::MATRIX[$key])) {
            MarketplaceLogger::info($tenantId, 'digikala', 'webhook', 'Unhandled webhook event', ['event' => $event, 'resolved' => $key]);

            return ['event' => $key, 'queued' => false, 'reason' => 'unhandled'];
        }
        $enabled = self::normalizeEvents($this->settings->credentials($tenantId, 'digikala')['webhook_events'] ?? null);
        if (empty($enabled[$key])) {
            MarketplaceLogger::info($tenantId, 'digikala', 'webhook', 'Webhook event disabled in settings', ['event' => $key]);

            return ['event' => $key, 'queued' => false, 'reason' => 'disabled'];
        }
        $rule = self::MATRIX[$key];
        $jobPayload = ['source' => 'webhook', 'event' => $key, 'context' => $rule['context'], 'payload' => $payload];
        $dedupe = $rule['job'] === MarketplaceSync::PULL_ORDERS ? MarketplaceSync::PULL_ORDERS : null;
        $this->sync->enqueue($tenantId, 'digikala', $rule['job'], $jobPayload, 4, 2, $dedupe);
        MarketplaceLogger::info($tenantId, 'digikala', 'webhook', 'Webhook event routed to queue', ['event' => $key, 'job_type' => $rule['job']]);

        return ['event' => $key, 'queued' => true, 'job' => $rule['job']];
    }

    public static function webhookUrl(int $tenantId): string
    {
        $tenant = Tenant::query()->find($tenantId);
        $domain = $tenant?->domain
            ? 'https://'.preg_replace('#^https?://#', '', rtrim((string) $tenant->domain, '/'))
            : rtrim((string) config('app.url'), '/');

        return $domain.'/api/v1/public/marketplace/digikala/webhook';
    }

    /** @return list<array{key: string, job: string, context: string, label_fa: string, label_en: string, official: ?string}> */
    public static function matrixRows(): array
    {
        $rows = [];
        foreach (self::MATRIX as $key => $rule) {
            $rows[] = array_merge(['key' => $key], $rule, ['official' => self::OFFICIAL[$key] ?? null]);
        }

        return $rows;
    }
}
