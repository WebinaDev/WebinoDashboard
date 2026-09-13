<?php

use App\Http\Controllers\OpenApiController;
use App\Http\Controllers\Api\V1\AcademyCourseController;
use App\Http\Controllers\Api\V1\AccountingController;
use App\Http\Controllers\Api\V1\AiRecommendationController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AnnouncementController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BlogPostController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CafeSettingsController;
use App\Http\Controllers\Api\V1\CafeBranchController;
use App\Http\Controllers\Api\V1\CafePdfController;
use App\Http\Controllers\Api\V1\CafeQrController;
use App\Http\Controllers\Api\V1\AllergenController;
use App\Http\Controllers\Api\V1\MenuController;
use App\Http\Controllers\Api\V1\MenuBannerController;
use App\Http\Controllers\Api\V1\ProductModifierController;
use App\Http\Controllers\Api\V1\ReservationController;
use App\Http\Controllers\Api\V1\PublicPortfolioController;
use App\Http\Controllers\Api\V1\PublicReservationController;
use App\Http\Controllers\Api\V1\PublicCafeEngagementController;
use App\Http\Controllers\Api\V1\PublicGuestCartController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\CmsController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\KernelController;
use App\Http\Controllers\Api\V1\LicenseController;
use App\Http\Controllers\Api\V1\MagazineArticleController;
use App\Http\Controllers\Api\V1\MarketingController;
use App\Http\Controllers\Api\V1\MediaController;
use App\Http\Controllers\Api\V1\MobileContractController;
use App\Http\Controllers\Api\V1\ModuleController;
use App\Http\Controllers\Api\V1\ModuleInstallController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentCallbackController;
use App\Http\Controllers\Api\V1\PaymentIntentController;
use App\Http\Controllers\Api\V1\PortfolioItemController;
use App\Http\Controllers\Api\V1\BrandController;
use App\Http\Controllers\Api\V1\C2cController;
use App\Http\Controllers\Api\V1\CoffeeController;
use App\Http\Controllers\Api\V1\MarketplaceController;
use App\Http\Controllers\Api\V1\PricingController;
use App\Http\Controllers\Api\V1\ProductAttributeController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProductVariantController;
use App\Http\Controllers\Api\V1\WalletController;
use App\Http\Controllers\Api\V1\BotController;
use App\Http\Controllers\Api\V1\CouponController;
use App\Http\Controllers\Api\V1\ModirPayamakController;
use App\Http\Controllers\Api\V1\PublicCatalogController;
use App\Http\Controllers\Api\V1\PublicCafeController;
use App\Http\Controllers\Api\V1\ProvisionController;
use App\Http\Controllers\Api\V1\PublicAcademyController;
use App\Http\Controllers\Api\V1\PublicBlogController;
use App\Http\Controllers\Api\V1\PublicCmsController;
use App\Http\Controllers\Api\V1\PublicConsultationController;
use App\Http\Controllers\Api\V1\PublicCorporateController;
use App\Http\Controllers\Api\V1\PublicKernelController;
use App\Http\Controllers\Api\V1\PublicMagazineController;
use App\Http\Controllers\Api\V1\PublicResumeController;
use App\Http\Controllers\Api\V1\PublicSiteController;
use App\Http\Controllers\Api\V1\ReportsController;
use App\Http\Controllers\Api\V1\ResumeProfileController;
use App\Http\Controllers\Api\V1\SetupController;
use App\Http\Controllers\Api\V1\SiteConsultationController;
use App\Http\Controllers\Api\V1\TeamMemberController;
use App\Http\Controllers\Api\V1\TenantController;
use App\Http\Controllers\Api\V1\ThemeController;
use App\Http\Controllers\Api\V1\TestimonialController;
use App\Http\Controllers\Api\V1\TwoFactorController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/openapi.json', [OpenApiController::class, 'show']);

    Route::get('/health/readiness', [\App\Http\Controllers\Api\V1\HealthController::class, 'readiness'])
        ->withoutMiddleware([
            \App\Http\Middleware\ThrottleApiToken::class,
            \App\Http\Middleware\AuthenticateFromCookie::class,
            \App\Http\Middleware\EnsureUserIsActive::class,
            \App\Http\Middleware\RequirePasswordChange::class,
            \App\Http\Middleware\RequireTwoFactor::class,
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);
    Route::get('/health/metrics', [\App\Http\Controllers\Api\V1\HealthController::class, 'metrics'])
        ->withoutMiddleware([
            \App\Http\Middleware\ThrottleApiToken::class,
            \App\Http\Middleware\AuthenticateFromCookie::class,
            \App\Http\Middleware\EnsureUserIsActive::class,
            \App\Http\Middleware\RequirePasswordChange::class,
            \App\Http\Middleware\RequireTwoFactor::class,
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);

    Route::post('/public/bots/{provider}/webhook', [BotController::class, 'webhook'])
        ->whereIn('provider', ['bale', 'telegram'])
        ->withoutMiddleware([
            \App\Http\Middleware\ThrottleApiToken::class,
            \App\Http\Middleware\AuthenticateFromCookie::class,
            \App\Http\Middleware\EnsureUserIsActive::class,
            \App\Http\Middleware\RequirePasswordChange::class,
            \App\Http\Middleware\RequireTwoFactor::class,
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);

    Route::get('/payments/callback/{provider}/{order}', [PaymentCallbackController::class, 'handle'])
        ->whereNumber('order');

    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/auth/session', [AuthController::class, 'session'])->middleware('throttle:5,1');
    Route::get('/auth/gate', [AuthController::class, 'gate']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/provision/bootstrap', [ProvisionController::class, 'bootstrap']);
    Route::post('/provision/admin', [ProvisionController::class, 'admin']);
    Route::post('/provision/branding', [ProvisionController::class, 'branding']);
    Route::post('/provision/modules/install', [ProvisionController::class, 'installModule']);
    Route::match(['get', 'post'], '/provision/modules/{slug}/status', [ProvisionController::class, 'moduleStatus']);
    Route::post('/provision/license-sync', [ProvisionController::class, 'licenseSync']);

    Route::prefix('public')->middleware('public.tenant')->group(function () {
        Route::get('/tenant', [PublicSiteController::class, 'tenant']);
        Route::get('/home', [PublicSiteController::class, 'home']);
        Route::get('/kernel/activations', [PublicKernelController::class, 'activations']);

        Route::middleware('public.module:blog')->group(function () {
            Route::get('/blog', [PublicBlogController::class, 'index']);
            Route::get('/blog/category/{slug}', [PublicBlogController::class, 'category']);
            Route::get('/blog/{slug}', [PublicBlogController::class, 'show']);
        });

        Route::middleware('public.module:articles')->group(function () {
            Route::get('/magazine', [PublicMagazineController::class, 'index']);
            Route::get('/magazine/{slug}', [PublicMagazineController::class, 'show']);
        });

        Route::middleware('public.module:profile')->group(function () {
            Route::get('/resume', [PublicResumeController::class, 'show']);
        });

        Route::middleware('public.module:academy')->group(function () {
            Route::get('/academy', [PublicAcademyController::class, 'index']);
            Route::get('/academy/{slug}', [PublicAcademyController::class, 'show']);
        });

        Route::middleware('public.module:portfolio')->group(function () {
            Route::get('/portfolio', [PublicPortfolioController::class, 'index']);
            Route::get('/portfolio/{slug}', [PublicPortfolioController::class, 'show']);
        });

        Route::middleware('public.module:announcements')->group(function () {
            Route::get('/announcements', [PublicCorporateController::class, 'announcements']);
        });

        Route::middleware('public.module:testimonials')->group(function () {
            Route::get('/testimonials', [PublicCorporateController::class, 'testimonials']);
        });

        Route::middleware('public.module:team')->group(function () {
            Route::get('/team', [PublicCorporateController::class, 'team']);
        });

        Route::middleware('public.module:cms')->group(function () {
            Route::get('/pages/{slug}', [PublicCmsController::class, 'page']);
        });

        Route::middleware('public.module:consultations')->group(function () {
            Route::post('/consultations', [PublicConsultationController::class, 'store']);
        });

        Route::middleware('public.module:catalog')->group(function () {
            Route::get('/catalog', [PublicCatalogController::class, 'index']);
            Route::get('/catalog/items/{slug}', [PublicCatalogController::class, 'show']);
        });

        Route::middleware('public.module:cafe')->group(function () {
            Route::get('/cafe/venue', [PublicCafeController::class, 'venue']);
            Route::get('/cafe/events', [PublicReservationController::class, 'events']);
            Route::post('/cafe/reservations', [PublicReservationController::class, 'store']);
            Route::post('/cafe/events/{event}/bookings', [PublicReservationController::class, 'bookEvent'])->whereNumber('event');
            Route::get('/cafe/phone-gate', [PublicCafeEngagementController::class, 'checkPhoneGate']);
            Route::post('/cafe/phone-register', [PublicCafeEngagementController::class, 'registerPhone']);
            Route::post('/cafe/products/{product}/like', [PublicCafeEngagementController::class, 'like'])->whereNumber('product');
            Route::post('/cafe/products/{product}/feedback', [PublicCafeEngagementController::class, 'feedback'])->whereNumber('product');
            Route::get('/cafe/cart', [PublicGuestCartController::class, 'show']);
            Route::post('/cafe/cart/items', [PublicGuestCartController::class, 'addItem']);
            Route::post('/cafe/checkout', [PublicGuestCartController::class, 'checkout']);
        });
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/check', [AuthController::class, 'check']);
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::get('/auth/user', [AuthController::class, 'user']);
        Route::post('/auth/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');

        Route::prefix('auth/2fa')->group(function () {
            Route::get('/status', [TwoFactorController::class, 'status']);
            Route::post('/enable', [TwoFactorController::class, 'enable']);
            Route::post('/confirm', [TwoFactorController::class, 'confirm']);
            Route::post('/disable', [TwoFactorController::class, 'disable']);
            Route::post('/verify', [TwoFactorController::class, 'verify']);
        });

        Route::get('/modules', [ModuleController::class, 'index']);
        Route::patch('/modules/{slug}', [ModuleController::class, 'update']);

        Route::post('/license/sync', [LicenseController::class, 'sync']);
        Route::post('/modules/{slug}/install', [ModuleInstallController::class, 'install']);
        Route::get('/modules/{slug}/status', [ModuleInstallController::class, 'status']);

        Route::get('/setup/status', [SetupController::class, 'status']);
        Route::post('/setup/apply-site-type', [SetupController::class, 'applySiteType']);
        Route::patch('/setup/store', [SetupController::class, 'updateStore']);
        Route::patch('/setup/crm', [SetupController::class, 'updateCrm']);
        Route::post('/setup/sync-license', [SetupController::class, 'syncLicense']);
        Route::post('/setup/complete', [SetupController::class, 'complete']);

        Route::get('/kernel/registry', [KernelController::class, 'registry']);
        Route::get('/kernel/site-types', [KernelController::class, 'siteTypes']);
        Route::get('/kernel/activations', [KernelController::class, 'tenantActivations']);

        Route::get('/tenant', [TenantController::class, 'show']);

        Route::get('/themes', [ThemeController::class, 'index']);
        Route::post('/themes/{slug}/activate', [ThemeController::class, 'activate']);
        Route::patch('/themes/branding', [ThemeController::class, 'updateBranding']);

        Route::middleware('module:dashboard')->group(function () {
            Route::get('/analytics/summary', [AnalyticsController::class, 'summary']);
        });

        Route::middleware('module:catalog')->group(function () {
            Route::apiResource('categories', CategoryController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
            Route::get('/products/lookup', [ProductController::class, 'lookup']);
            Route::patch('/products/bulk', [ProductController::class, 'bulkUpdate']);
            Route::post('/products/{product}/duplicate', [ProductController::class, 'duplicate'])->whereNumber('product');
            Route::put('/products/{product}/attributes', [ProductController::class, 'syncAttributes'])->whereNumber('product');
            Route::apiResource('products', ProductController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
            Route::apiResource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('allergens', AllergenController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('menu-banners', MenuBannerController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::get('/products/{product}/modifiers', [ProductModifierController::class, 'index'])->whereNumber('product');
            Route::post('/products/{product}/modifiers', [ProductModifierController::class, 'store'])->whereNumber('product');
            Route::patch('/modifiers/{modifier}', [ProductModifierController::class, 'update'])->whereNumber('modifier');
            Route::delete('/modifiers/{modifier}', [ProductModifierController::class, 'destroy'])->whereNumber('modifier');
            Route::put('/products/{product}/allergens', [ProductModifierController::class, 'syncAllergens'])->whereNumber('product');
            Route::put('/products/{product}/media', [ProductModifierController::class, 'syncMedia'])->whereNumber('product');
        });

        Route::middleware('module:brands')->group(function () {
            Route::apiResource('brands', BrandController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
        });

        Route::middleware('module:attributes')->group(function () {
            Route::get('/attributes', [ProductAttributeController::class, 'index']);
            Route::post('/attributes', [ProductAttributeController::class, 'store']);
            Route::get('/attributes/{attribute}', [ProductAttributeController::class, 'show'])->whereNumber('attribute');
            Route::patch('/attributes/{attribute}', [ProductAttributeController::class, 'update'])->whereNumber('attribute');
            Route::delete('/attributes/{attribute}', [ProductAttributeController::class, 'destroy'])->whereNumber('attribute');
            Route::get('/attributes/{attribute}/terms', [ProductAttributeController::class, 'termsIndex'])->whereNumber('attribute');
            Route::post('/attributes/{attribute}/terms', [ProductAttributeController::class, 'termsStore'])->whereNumber('attribute');
            Route::patch('/attribute-terms/{term}', [ProductAttributeController::class, 'termsUpdate'])->whereNumber('term');
            Route::delete('/attribute-terms/{term}', [ProductAttributeController::class, 'termsDestroy'])->whereNumber('term');
            Route::get('/attribute-groups', [ProductAttributeController::class, 'groupsIndex']);
            Route::post('/attribute-groups', [ProductAttributeController::class, 'groupsStore']);
            Route::patch('/attribute-groups/{group}', [ProductAttributeController::class, 'groupsUpdate'])->whereNumber('group');
            Route::delete('/attribute-groups/{group}', [ProductAttributeController::class, 'groupsDestroy'])->whereNumber('group');
        });

        Route::middleware('module:pricing')->group(function () {
            Route::get('/pricing/settings', [PricingController::class, 'settings']);
            Route::put('/pricing/settings', [PricingController::class, 'updateSettings']);
            Route::post('/pricing/calculate', [PricingController::class, 'calculate']);
            Route::post('/pricing/quick-add', [PricingController::class, 'quickAdd']);
            Route::get('/pricing/bulk-products', [PricingController::class, 'bulkProducts']);
            Route::patch('/pricing/bulk-products/{product}/purchase-price', [PricingController::class, 'patchPurchase'])->whereNumber('product');
            Route::patch('/pricing/bulk-products/{product}/wc-price', [PricingController::class, 'patchWcPrice'])->whereNumber('product');
            Route::patch('/pricing/bulk-products/{product}/stock', [PricingController::class, 'patchStock'])->whereNumber('product');
            Route::patch('/pricing/bulk-products/{product}/lock', [PricingController::class, 'patchLock'])->whereNumber('product');
            Route::patch('/pricing/bulk-products/{product}/wholesale-rule', [PricingController::class, 'patchWholesale'])->whereNumber('product');
            Route::patch('/products/{product}/wfcp', [PricingController::class, 'patchProductWfcp'])->whereNumber('product');
            Route::post('/pricing/bulk-price-change/start', [PricingController::class, 'bulkPriceStart']);
            Route::get('/pricing/bulk-price-change/state', [PricingController::class, 'bulkPriceState']);
        });

        Route::middleware('module:marketplace')->group(function () {
            Route::get('/marketplace/products/{product}/maps', [MarketplaceController::class, 'maps'])->whereNumber('product');
            Route::post('/marketplace/products/{product}/maps', [MarketplaceController::class, 'saveMaps'])->whereNumber('product');
            Route::post('/marketplace/products/{product}/sync-now', [MarketplaceController::class, 'syncNow'])->whereNumber('product');
            Route::post('/marketplace/products/{product}/create-remote', [MarketplaceController::class, 'createRemote'])->whereNumber('product');
            Route::post('/marketplace/digikala/products/{product}/map', [MarketplaceController::class, 'digikalaMap'])->whereNumber('product');
        });

        Route::middleware('module:coffee_profile')->group(function () {
            Route::get('/coffee/profile-settings', [CoffeeController::class, 'profileSettings']);
            Route::put('/coffee/profile-settings', [CoffeeController::class, 'updateProfileSettings']);
            Route::get('/coffee/pricing-settings', [CoffeeController::class, 'pricingSettings']);
            Route::put('/coffee/pricing-settings', [CoffeeController::class, 'updatePricingSettings']);
            Route::get('/coffee/blend-settings', [CoffeeController::class, 'blendSettings']);
            Route::put('/coffee/blend-settings', [CoffeeController::class, 'updateBlendSettings']);
            Route::get('/coffee/origins', [CoffeeController::class, 'originsIndex']);
            Route::post('/coffee/origins', [CoffeeController::class, 'originsStore']);
            Route::patch('/coffee/origins/{origin}', [CoffeeController::class, 'originsUpdate'])->whereNumber('origin');
            Route::delete('/coffee/origins/{origin}', [CoffeeController::class, 'originsDestroy'])->whereNumber('origin');
            Route::get('/products/{product}/coffee-profile', [CoffeeController::class, 'productProfile'])->whereNumber('product');
            Route::put('/products/{product}/coffee-profile', [CoffeeController::class, 'updateProductProfile'])->whereNumber('product');
            Route::get('/products/{product}/coffee-profile/price-by-attribute', [CoffeeController::class, 'priceByAttribute'])->whereNumber('product');
            Route::post('/products/{product}/coffee-profile/price-by-attribute', [CoffeeController::class, 'applyPriceByAttribute'])->whereNumber('product');
        });

        Route::middleware('module:variants')->group(function () {
            Route::get('/products/{product}/variants', [ProductVariantController::class, 'index'])->whereNumber('product');
            Route::post('/products/{product}/variants', [ProductVariantController::class, 'store'])->whereNumber('product');
            Route::delete('/products/{product}/variations', [ProductVariantController::class, 'destroyAll'])->whereNumber('product');
            Route::post('/products/{product}/variations/bulk', [ProductVariantController::class, 'bulk'])->whereNumber('product');
            Route::post('/products/{product}/variations/generate', [ProductVariantController::class, 'generate'])->whereNumber('product');
            Route::post('/products/{product}/variations/default', [ProductVariantController::class, 'setDefault'])->whereNumber('product');
            Route::patch('/variants/{variant}', [ProductVariantController::class, 'update'])->whereNumber('variant');
            Route::delete('/variants/{variant}', [ProductVariantController::class, 'destroy'])->whereNumber('variant');
        });

        Route::middleware('module:cafe_menu')->group(function () {
            Route::get('/cafe/menu-settings', [CafeSettingsController::class, 'showMenu']);
            Route::patch('/cafe/menu-settings', [CafeSettingsController::class, 'updateMenu']);
            Route::get('/cafe/engagement-settings', [CafeSettingsController::class, 'showEngagement']);
            Route::patch('/cafe/engagement-settings', [CafeSettingsController::class, 'updateEngagement']);
        });

        Route::middleware('module:cafe_qr')->group(function () {
            Route::get('/cafe/qr-settings', [CafeQrController::class, 'showSettings']);
            Route::patch('/cafe/qr-settings', [CafeQrController::class, 'updateSettings']);
            Route::get('/cafe/qr', [CafeQrController::class, 'menuQr']);
            Route::get('/cafe/menu-pdf', [CafePdfController::class, 'menuPdf']);
            Route::apiResource('cafe/branches', CafeBranchController::class)->only(['index', 'store', 'update', 'destroy']);
        });

        Route::middleware('module:cafe_reservations')->group(function () {
            Route::get('/cafe/reservations', [ReservationController::class, 'index']);
            Route::patch('/cafe/reservations/{reservation}', [ReservationController::class, 'updateReservation'])->whereNumber('reservation');
            Route::post('/cafe/events', [ReservationController::class, 'storeEvent']);
            Route::patch('/cafe/events/{event}', [ReservationController::class, 'updateEvent'])->whereNumber('event');
            Route::patch('/cafe/event-bookings/{booking}', [ReservationController::class, 'updateEventBooking'])->whereNumber('booking');
        });

        Route::middleware('module:cafe_hours')->group(function () {
            Route::get('/cafe/hours-settings', [CafeSettingsController::class, 'showHours']);
            Route::patch('/cafe/hours-settings', [CafeSettingsController::class, 'updateHours']);
        });

        Route::middleware('module:cafe_gallery')->group(function () {
            Route::get('/cafe/gallery-settings', [CafeSettingsController::class, 'showGallery']);
            Route::patch('/cafe/gallery-settings', [CafeSettingsController::class, 'updateGallery']);
        });

        Route::middleware('module:cafe_venue')->group(function () {
            Route::get('/cafe/venue-settings', [CafeSettingsController::class, 'showVenue']);
            Route::patch('/cafe/venue-settings', [CafeSettingsController::class, 'updateVenue']);
        });

        Route::middleware('module:orders')->group(function () {
            Route::get('/orders', [OrderController::class, 'index']);
            Route::get('/orders/statuses', [OrderController::class, 'statuses']);
            Route::get('/orders/filter-options', [OrderController::class, 'filterOptions']);
            Route::post('/orders', [OrderController::class, 'store']);
            Route::post('/orders/bulk', [OrderController::class, 'bulk']);
            Route::get('/orders/{order}', [OrderController::class, 'show'])->whereNumber('order');
            Route::patch('/orders/{order}', [OrderController::class, 'update'])->whereNumber('order');
            Route::put('/orders/{order}', [OrderController::class, 'rewrite'])->whereNumber('order');
            Route::delete('/orders/{order}', [OrderController::class, 'destroy'])->whereNumber('order');
            Route::get('/orders/{order}/notes', [OrderController::class, 'notesIndex'])->whereNumber('order');
            Route::post('/orders/{order}/notes', [OrderController::class, 'notesStore'])->whereNumber('order');
            Route::delete('/order-notes/{note}', [OrderController::class, 'notesDestroy'])->whereNumber('note');
            Route::get('/orders/{order}/returns', [OrderController::class, 'returnsIndex'])->whereNumber('order');
            Route::post('/orders/{order}/returns', [OrderController::class, 'returnsStore'])->whereNumber('order');
            Route::post('/order-returns/{returnId}/action', [OrderController::class, 'returnsAction'])->whereNumber('returnId');
            Route::get('/orders/{order}/print', [OrderController::class, 'printReceipt'])->whereNumber('order');
        });

        Route::middleware('module:pos')->group(function () {
            Route::get('/products/pos-search', [OrderController::class, 'posSearch']);
            Route::get('/pos/customers', [OrderController::class, 'posCustomers']);
            Route::get('/payment-gateways', [OrderController::class, 'paymentGateways']);
            Route::post('/pos/orders', [OrderController::class, 'store']);
            Route::get('/pos/orders/{order}/print', [OrderController::class, 'printReceipt'])->whereNumber('order');
        });

        Route::middleware('module:c2c')->group(function () {
            Route::get('/c2c/settings', [C2cController::class, 'settings']);
            Route::put('/c2c/settings', [C2cController::class, 'updateSettings']);
            Route::get('/c2c/receipts', [C2cController::class, 'receipts']);
            Route::post('/c2c/receipts/{order}', [C2cController::class, 'decide'])->whereNumber('order');
        });

        Route::middleware('module:wallet')->group(function () {
            Route::get('/wallet/settings', [WalletController::class, 'settings']);
            Route::put('/wallet/settings', [WalletController::class, 'updateSettings']);
            Route::get('/wallet/users/{user}', [WalletController::class, 'userWallet'])->whereNumber('user');
            Route::post('/wallet/users/{user}/adjust', [WalletController::class, 'adjust'])->whereNumber('user');
            Route::post('/wallet/topup', [WalletController::class, 'topup']);
            Route::get('/wallet/withdrawals', [WalletController::class, 'withdrawals']);
            Route::patch('/wallet/withdrawals', [WalletController::class, 'updateWithdrawal']);
            Route::post('/wallet/withdrawals', [WalletController::class, 'createWithdrawal']);
        });

        Route::middleware('module:cart')->group(function () {
            Route::get('/cart', [CartController::class, 'show']);
            Route::post('/cart/items', [CartController::class, 'addItem']);
            Route::delete('/cart/items/{product}', [CartController::class, 'removeItem']);
        });

        Route::middleware('module:checkout')->group(function () {
            Route::post('/checkout', [CheckoutController::class, 'store']);
            Route::post('/payments/intent', [PaymentIntentController::class, 'store']);
        });

        Route::middleware('module:inventory')->group(function () {
            Route::get('/inventory/summary', [InventoryController::class, 'summary']);
        });

        Route::middleware('module:reports')->group(function () {
            Route::get('/reports/overview', [ReportsController::class, 'overview']);
        });

        Route::middleware('module:marketing')->group(function () {
            Route::get('/marketing/campaigns', [MarketingController::class, 'campaigns']);
        });

        Route::middleware('module:coupons')->group(function () {
            Route::get('/marketing/coupons', [CouponController::class, 'index']);
            Route::post('/marketing/coupons', [CouponController::class, 'store']);
            Route::get('/marketing/coupons/generate-code', [CouponController::class, 'generateCode']);
            Route::post('/marketing/coupons/preview', [CouponController::class, 'preview']);
            Route::post('/marketing/coupons/bulk', [CouponController::class, 'bulk']);
            Route::get('/marketing/coupons/{coupon}', [CouponController::class, 'show'])->whereNumber('coupon');
            Route::put('/marketing/coupons/{coupon}', [CouponController::class, 'update'])->whereNumber('coupon');
            Route::patch('/marketing/coupons/{coupon}', [CouponController::class, 'update'])->whereNumber('coupon');
            Route::delete('/marketing/coupons/{coupon}', [CouponController::class, 'destroy'])->whereNumber('coupon');
        });

        foreach (['bale' => 'bots_bale', 'telegram' => 'bots_telegram'] as $provider => $moduleSlug) {
            Route::middleware('module:'.$moduleSlug)->prefix('bots/'.$provider)->group(function () use ($provider) {
                Route::get('/settings', fn (\Illuminate\Http\Request $r) => app(BotController::class)->settings($r, $provider));
                Route::put('/settings', fn (\Illuminate\Http\Request $r) => app(BotController::class)->updateSettings($r, $provider));
                Route::get('/sessions', fn (\Illuminate\Http\Request $r) => app(BotController::class)->sessions($r, $provider));
                Route::post('/send', fn (\Illuminate\Http\Request $r) => app(BotController::class)->send($r, $provider));
                Route::get('/broadcast', fn (\Illuminate\Http\Request $r) => app(BotController::class)->broadcast($r, $provider));
                Route::post('/broadcast/start', fn (\Illuminate\Http\Request $r) => app(BotController::class)->broadcastStart($r, $provider));
                Route::post('/broadcast/cancel', fn (\Illuminate\Http\Request $r) => app(BotController::class)->broadcastCancel($r, $provider));
                Route::get('/campaigns', fn (\Illuminate\Http\Request $r) => app(BotController::class)->campaigns($r, $provider));
                Route::post('/campaigns', fn (\Illuminate\Http\Request $r) => app(BotController::class)->campaignsStore($r, $provider));
                Route::post('/users/import', fn (\Illuminate\Http\Request $r) => app(BotController::class)->importUsers($r, $provider));
            });
        }

        Route::middleware('module:sms')->group(function () {
            Route::match(['get', 'post'], '/modirpayamak/{path?}', [ModirPayamakController::class, 'proxy'])
                ->where('path', '.*');
        });

        Route::middleware('module:cms')->group(function () {
            Route::get('/cms/pages', [CmsController::class, 'pages']);
            Route::post('/cms/pages', [CmsController::class, 'store']);
            Route::patch('/cms/pages/{page}', [CmsController::class, 'update'])->whereNumber('page');
            Route::delete('/cms/pages/{page}', [CmsController::class, 'destroy'])->whereNumber('page');
            Route::get('/cms/home-blocks', [CmsController::class, 'homeBlocks']);
            Route::put('/cms/home-blocks', [CmsController::class, 'updateHomeBlocks']);
        });

        Route::middleware('module:blog')->group(function () {
            Route::get('/blog/posts', [BlogPostController::class, 'index']);
            Route::post('/blog/posts', [BlogPostController::class, 'store']);
            Route::patch('/blog/posts/{post}', [BlogPostController::class, 'update'])->whereNumber('post');
            Route::delete('/blog/posts/{post}', [BlogPostController::class, 'destroy'])->whereNumber('post');
        });

        Route::middleware('module:media')->group(function () {
            Route::get('/media', [MediaController::class, 'index']);
            Route::post('/media', [MediaController::class, 'store']);
            Route::delete('/media/{id}', [MediaController::class, 'destroy'])->whereNumber('id');
        });

        Route::middleware('module:magazine')->group(function () {
            Route::get('/magazine/articles', [MagazineArticleController::class, 'index']);
            Route::post('/magazine/articles', [MagazineArticleController::class, 'store']);
            Route::patch('/magazine/articles/{article}', [MagazineArticleController::class, 'update'])->whereNumber('article');
            Route::delete('/magazine/articles/{article}', [MagazineArticleController::class, 'destroy'])->whereNumber('article');
        });

        Route::middleware('module:profile')->group(function () {
            Route::get('/resume/profile', [ResumeProfileController::class, 'show']);
            Route::put('/resume/profile', [ResumeProfileController::class, 'update']);
        });

        Route::middleware('module:academy')->group(function () {
            Route::get('/academy/courses', [AcademyCourseController::class, 'index']);
            Route::post('/academy/courses', [AcademyCourseController::class, 'store']);
            Route::patch('/academy/courses/{course}', [AcademyCourseController::class, 'update'])->whereNumber('course');
            Route::delete('/academy/courses/{course}', [AcademyCourseController::class, 'destroy'])->whereNumber('course');
            Route::post('/academy/courses/{course}/lessons', [AcademyCourseController::class, 'storeLesson'])->whereNumber('course');
        });

        Route::middleware('module:portfolio')->group(function () {
            Route::get('/portfolio/items', [PortfolioItemController::class, 'index']);
            Route::post('/portfolio/items', [PortfolioItemController::class, 'store']);
            Route::patch('/portfolio/items/{item}', [PortfolioItemController::class, 'update'])->whereNumber('item');
            Route::delete('/portfolio/items/{item}', [PortfolioItemController::class, 'destroy'])->whereNumber('item');
        });

        Route::middleware('module:announcements')->group(function () {
            Route::get('/announcements', [AnnouncementController::class, 'index']);
            Route::post('/announcements', [AnnouncementController::class, 'store']);
            Route::patch('/announcements/{announcement}', [AnnouncementController::class, 'update'])->whereNumber('announcement');
            Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy'])->whereNumber('announcement');
        });

        Route::middleware('module:testimonials')->group(function () {
            Route::get('/testimonials', [TestimonialController::class, 'index']);
            Route::post('/testimonials', [TestimonialController::class, 'store']);
            Route::patch('/testimonials/{testimonial}', [TestimonialController::class, 'update'])->whereNumber('testimonial');
            Route::delete('/testimonials/{testimonial}', [TestimonialController::class, 'destroy'])->whereNumber('testimonial');
        });

        Route::middleware('module:team')->group(function () {
            Route::get('/team/members', [TeamMemberController::class, 'index']);
            Route::post('/team/members', [TeamMemberController::class, 'store']);
            Route::patch('/team/members/{member}', [TeamMemberController::class, 'update'])->whereNumber('member');
            Route::delete('/team/members/{member}', [TeamMemberController::class, 'destroy'])->whereNumber('member');
        });

        Route::middleware('module:consultations')->group(function () {
            Route::get('/consultations', [SiteConsultationController::class, 'index']);
            Route::get('/consultations/{consultation}', [SiteConsultationController::class, 'show'])->whereNumber('consultation');
            Route::patch('/consultations/{consultation}', [SiteConsultationController::class, 'update'])->whereNumber('consultation');
        });

        Route::middleware('module:native_api')->group(function () {
            Route::get('/contracts/mobile', [MobileContractController::class, 'show']);
        });

        Route::middleware('module:ai_recommendations')->group(function () {
            Route::post('/ai/recommendations', [AiRecommendationController::class, 'store']);
        });

        Route::middleware('module:accounting')->group(function () {
            Route::get('/accounting/status', [AccountingController::class, 'status']);
        });
    });
});
