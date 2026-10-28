<?php

namespace App\Services\Shop;

use App\Models\Product;
use App\Models\ProductStockAlert;
use App\Services\Notifications\NotificationDispatcher;

class StockAlertNotifier
{
    public function __construct(protected NotificationDispatcher $dispatcher) {}

    public function notifyBackInStock(Product $product): void
    {
        $this->flushAlerts($product, ProductStockAlert::TYPE_BACK_IN_STOCK);
    }

    public function notifyOnSale(Product $product): void
    {
        if (! $product->isOnSale()) {
            return;
        }
        $this->flushAlerts($product, ProductStockAlert::TYPE_ON_SALE);
    }

    /** Notify price-drop subscribers when the customer-facing price went down. */
    public function notifyPriceDrop(Product $product, int $previousPriceMinor): void
    {
        $now = $product->effectivePriceMinor();
        if ($previousPriceMinor <= 0 || $now <= 0 || $now >= $previousPriceMinor) {
            return;
        }
        $this->flushAlerts($product, ProductStockAlert::TYPE_PRICE_DROP, ['price' => number_format($now)]);
    }

    /** @param  array<string, string>  $extraVars */
    protected function flushAlerts(Product $product, string $type, array $extraVars = []): void
    {
        $rows = ProductStockAlert::query()
            ->where('tenant_id', $product->tenant_id)
            ->where('product_id', $product->id)
            ->where('alert_type', $type)
            ->whereNull('notified_at')
            ->limit(200)
            ->get();

        foreach ($rows as $alert) {
            try {
                $event = match ($type) {
                    ProductStockAlert::TYPE_ON_SALE => 'product_on_sale',
                    ProductStockAlert::TYPE_PRICE_DROP => 'product_price_drop',
                    default => 'product_back_in_stock',
                };
                $this->dispatcher->dispatch($event, (int) $product->tenant_id, [
                    'vars' => array_merge([
                        'product_name' => (string) $product->name,
                        'product_url' => $this->productUrl($product),
                        'destination' => (string) $alert->destination,
                    ], $extraVars),
                    'only' => [$alert->channel],
                    'customer_user_id' => $alert->user_id ? (int) $alert->user_id : null,
                    'customer_phone' => $alert->channel === 'sms' ? (string) $alert->destination : null,
                    'customer_email' => $alert->channel === 'email' ? (string) $alert->destination : null,
                ]);
            } catch (\Throwable) {
            }
            $alert->update(['notified_at' => now()]);
        }
    }

    protected function productUrl(Product $product): string
    {
        if (! $product->slug) {
            return '';
        }
        $path = app(\App\Services\Seo\SeoSettingsService::class)->productPath((int) $product->tenant_id, (string) $product->slug);
        $domain = rtrim((string) (\App\Models\Tenant::query()->whereKey($product->tenant_id)->value('domain') ?? ''), '/');
        if ($domain === '') {
            return $path;
        }

        return (str_starts_with($domain, 'http') ? '' : 'https://').$domain.$path;
    }
}
