<?php

namespace App\Observers;

use App\Models\Product;
use App\Services\Bots\Engine\ChannelPublisher;

class ProductChannelObserver
{
    public function saved(Product $product): void
    {
        try {
            ChannelPublisher::onProductSaved($product);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
