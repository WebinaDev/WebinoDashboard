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

    protected function flushAlerts(Product $product, string $type): void
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
                $event = $type === ProductStockAlert::TYPE_ON_SALE ? 'product_on_sale' : 'product_back_in_stock';
                $this->dispatcher->dispatch($event, (int) $product->tenant_id, [
                    'vars' => [
                        'product_name' => (string) $product->name,
                        'destination' => (string) $alert->destination,
                    ],
                    'customer_user_id' => $alert->user_id ? (int) $alert->user_id : null,
                    'admin_email_override' => $alert->channel === 'email' ? $alert->destination : null,
                ]);
            } catch (\Throwable) {
            }
            $alert->update(['notified_at' => now()]);
        }
    }
}
