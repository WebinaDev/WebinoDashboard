<?php

namespace App\Providers;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Observers\MarketplaceOrderObserver;
use App\Observers\MarketplaceProductObserver;
use App\Observers\OrderStatusObserver;
use App\Observers\ProductStockObserver;
use App\Services\WordpressImport\RemoteAssetFetcher;
use App\Services\WordpressImport\SafeRemoteFetcher;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(RemoteAssetFetcher::class, SafeRemoteFetcher::class);
    }

    public function boot(): void
    {
        RateLimiter::for('public-writes', function (Request $request) {
            $tenant = (string) ($request->attributes->get('public_tenant_id') ?: $request->getHost());
            $ip = (string) ($request->ip() ?: 'unknown');

            return [
                Limit::perMinute(30)->by($ip.'|'.$tenant),
                Limit::perMinute(120)->by('tenant:'.$tenant),
            ];
        });

        Product::observe(MarketplaceProductObserver::class);
        ProductVariant::observe(MarketplaceProductObserver::class);
        Order::observe(MarketplaceOrderObserver::class);
        Order::observe(OrderStatusObserver::class);
        Product::observe(ProductStockObserver::class);

        Scramble::ignoreDefaultRoutes();

        Scramble::extendOpenApi(function (OpenApi $openApi): void {
            $openApi->secure(
                SecurityScheme::http('bearer', 'JWT')
            );
        });
    }
}
