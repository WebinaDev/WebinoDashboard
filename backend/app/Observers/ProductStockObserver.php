<?php

namespace App\Observers;

use App\Models\Product;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Shop\ShopSettings;
use App\Services\Shop\StockAlertNotifier;

class ProductStockObserver
{
    public function __construct(
        protected NotificationDispatcher $dispatcher,
        protected StockAlertNotifier $customerAlerts,
    ) {}

    public function updated(Product $product): void
    {
        if (! $product->wasChanged('stock') || $product->stock === null) {
            return;
        }
        if (! $product->manage_stock) {
            return;
        }

        $old = $product->getOriginal('stock');
        $new = (int) $product->stock;
        $wasOut = $old !== null && (int) $old <= 0 && $new > 0;
        if ($old !== null && (int) $old <= $new && ! $wasOut) {
            return;
        }
        if ($wasOut) {
            try {
                $this->customerAlerts->notifyBackInStock($product);
            } catch (\Throwable) {
            }
        }
        $old = $old === null ? PHP_INT_MAX : (int) $old;

        $settings = ShopSettings::getProducts((int) $product->tenant_id);
        $noStock = (int) ($settings['no_stock_threshold'] ?? 0);
        $lowStock = (int) ($settings['low_stock_threshold'] ?? 2);

        $event = null;
        if ($new <= $noStock && $old > $noStock) {
            $event = ! empty($settings['notify_no_stock']) ? 'stock_out' : null;
        } elseif ($new <= $lowStock && $new > $noStock && $old > $lowStock) {
            $event = ! empty($settings['notify_low_stock']) ? 'stock_low' : null;
        }
        if ($event === null) {
            return;
        }

        try {
            $recipient = trim((string) ($settings['stock_email_recipient'] ?? ''));
            $context = [
                'vars' => [
                    'product_name' => (string) $product->name,
                    'stock' => (string) $new,
                ],
                'admin_link' => '/dashboard/products/'.$product->id,
            ];
            if ($recipient !== '' && filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
                $context['admin_email_override'] = $recipient;
            }
            $this->dispatcher->dispatch($event, (int) $product->tenant_id, $context);
        } catch (\Throwable) {
        }
    }
}
