<?php

namespace App\Providers;

use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Observers\MarketplaceOrderObserver;
use App\Observers\MarketplaceProductObserver;
use App\Observers\OrderStatusObserver;
use App\Observers\ProductPriceHistoryObserver;
use App\Observers\CachePurgeObserver;
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
        \App\Services\Builder\BuilderRevisions::register();
        // Rate classes (WP shield rate-limit parity) — per-tenant tunable via site.security.rate.
        $rateFor = function (Request $request, string $key, int $default): int {
            $tid = (int) ($request->attributes->get('public_tenant_id') ?: ($request->user()?->tenant_id ?? 0));
            if ($tid <= 0) {
                return $default;
            }
            try {
                return (int) (\App\Services\Security\SecuritySettings::get($tid)['rate'][$key] ?? $default);
            } catch (\Throwable) {
                return $default;
            }
        };
        $limited = function (string $class) {
            return function (Request $request, array $headers) use ($class) {
                $tid = (int) ($request->attributes->get('public_tenant_id') ?: ($request->user()?->tenant_id ?? 0));
                \App\Services\Security\SecurityEventLogger::record($tid ?: null, 'rate_limited', $request, ['class' => $class]);

                return response()->json(['message' => __('api.too_many_requests')], 429, $headers);
            };
        };
        RateLimiter::for('public-writes', function (Request $request) use ($rateFor, $limited) {
            $tenant = (string) ($request->attributes->get('public_tenant_id') ?: $request->getHost());
            $ip = (string) ($request->ip() ?: 'unknown');

            return [
                Limit::perMinute($rateFor($request, 'public_writes_per_min', 30))->by($ip.'|'.$tenant)->response($limited('public-writes')),
                Limit::perMinute(120)->by('tenant:'.$tenant)->response($limited('public-writes-tenant')),
            ];
        });
        RateLimiter::for('checkout', function (Request $request) use ($rateFor, $limited) {
            $who = (string) ($request->user()?->id ?: $request->ip());

            return Limit::perMinute($rateFor($request, 'checkout_per_min', 10))->by('checkout:'.$who)->response($limited('checkout'));
        });

        Product::observe(MarketplaceProductObserver::class);
        ProductVariant::observe(MarketplaceProductObserver::class);
        Order::observe(MarketplaceOrderObserver::class);
        Order::observe(OrderStatusObserver::class);
        Product::observe(ProductStockObserver::class);
        Product::observe(\App\Observers\ProductChannelObserver::class);
        Product::observe(ProductPriceHistoryObserver::class);
        Product::observe(CachePurgeObserver::class);
        BlogPost::observe(CachePurgeObserver::class);
        CmsPage::observe(CachePurgeObserver::class);
        \App\Models\BuilderGlobal::observe(CachePurgeObserver::class);

        Scramble::ignoreDefaultRoutes();

        Scramble::extendOpenApi(function (OpenApi $openApi): void {
            $openApi->secure(
                SecurityScheme::http('bearer', 'JWT')
            );
        });
    }
}
