<?php

namespace App\Providers;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Observers\MarketplaceOrderObserver;
use App\Observers\MarketplaceProductObserver;
use App\Observers\OrderStatusObserver;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Product::observe(MarketplaceProductObserver::class);
        ProductVariant::observe(MarketplaceProductObserver::class);
        Order::observe(MarketplaceOrderObserver::class);
        Order::observe(OrderStatusObserver::class);

        Scramble::ignoreDefaultRoutes();

        Scramble::extendOpenApi(function (OpenApi $openApi): void {
            $openApi->secure(
                SecurityScheme::http('bearer', 'JWT')
            );
        });
    }
}
