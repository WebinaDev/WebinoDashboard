<?php

use App\Http\Controllers\OpenApiController;
use App\Http\Controllers\Api\V1\AcademyCourseController;
use App\Http\Controllers\Api\V1\AccountPortalController;
use App\Http\Controllers\Api\V1\AccountingController;
use App\Http\Controllers\Api\V1\AiContentController;
use App\Http\Controllers\Api\V1\AiRecommendationController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AnnouncementController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\OtpAuthController;
use App\Http\Controllers\Api\V1\BlogCategoryController;
use App\Http\Controllers\Api\V1\BlogPostController;
use App\Http\Controllers\Api\V1\BootstrapController;
use App\Http\Controllers\Api\V1\BuildPipelineController;
use App\Http\Controllers\Api\V1\CoreUpdateController;
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
use App\Http\Controllers\Api\V1\BuilderController;
use App\Http\Controllers\Api\V1\CmsController;
use App\Http\Controllers\Api\V1\PublicBuilderController;
use App\Http\Controllers\Api\V1\WordpressImportController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\KernelController;
use App\Http\Controllers\Api\V1\LicenseController;
use App\Http\Controllers\Api\V1\MagazineArticleController;
use App\Http\Controllers\Api\V1\MagazineTaxonomyController;
use App\Http\Controllers\Api\V1\MarketingController;
use App\Http\Controllers\Api\V1\MediaController;
use App\Http\Controllers\Api\V1\MediaTermController;
use App\Http\Controllers\Api\V1\MobileContractController;
use App\Http\Controllers\Api\V1\ModuleController;
use App\Http\Controllers\Api\V1\ModuleMarketplaceController;
use App\Http\Controllers\Api\V1\ModuleInstallController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentCallbackController;
use App\Http\Controllers\Api\V1\PaymentGatewaySettingsController;
use App\Http\Controllers\Api\V1\PaymentIntentController;
use App\Http\Controllers\Api\V1\PaymentsHubController;
use App\Http\Controllers\Api\V1\PortfolioItemController;
use App\Http\Controllers\Api\V1\BrandController;
use App\Http\Controllers\Api\V1\BulkSaleController;
use App\Http\Controllers\Api\V1\C2cController;
use App\Http\Controllers\Api\V1\CoffeeController;
use App\Http\Controllers\Api\V1\MarketplaceController;
use App\Http\Controllers\Api\V1\PricingController;
use App\Http\Controllers\Api\V1\ProductAttributeController;
use App\Http\Controllers\Api\V1\ProductCatalogController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProductTagController;
use App\Http\Controllers\Api\V1\ProductDownloadController;
use App\Http\Controllers\Api\V1\ProductQuestionController;
use App\Http\Controllers\Api\V1\ProductReviewController;
use App\Http\Controllers\Api\V1\ShopExtrasController;
use App\Http\Controllers\Api\V1\ProductVariantController;
use App\Http\Controllers\Api\V1\WalletController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\CustomerNoteController;
use App\Http\Controllers\Api\V1\UserAdminController;
use App\Http\Controllers\Api\V1\DashboardOverviewController;
use App\Http\Controllers\Api\V1\StaffController;
use App\Http\Controllers\Api\V1\SupportTicketController;
use App\Http\Controllers\Api\V1\RoleController;
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
use App\Http\Controllers\Api\V1\GeoController;
use App\Http\Controllers\Api\V1\PublicAnalyticsController;
use App\Http\Controllers\Api\V1\PublicOrderPaymentController;
use App\Http\Controllers\Api\V1\ReportsController;
use App\Http\Controllers\Api\V1\ResumeProfileController;
use App\Http\Controllers\Api\V1\SetupController;
use App\Http\Controllers\Api\V1\ShippingZonesController;
use App\Http\Controllers\Api\V1\SiteConsultationController;
use App\Http\Controllers\Api\V1\TapinController;
use App\Http\Controllers\Api\V1\TeamMemberController;
use App\Http\Controllers\Api\V1\TenantController;
use App\Http\Controllers\Api\V1\OrderDocumentController;
use App\Http\Controllers\Api\V1\TenantSettingsController;
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

    Route::get('/downloads/{orderItem}/{download}', [ProductDownloadController::class, 'serve'])
        ->name('downloads.serve')
        ->whereNumber(['orderItem', 'download']);

    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/auth/send-otp', [OtpAuthController::class, 'sendOtp'])->middleware('throttle:5,1');
    Route::post('/auth/verify-otp', [OtpAuthController::class, 'verifyOtp'])->middleware('throttle:5,1');
    Route::post('/auth/session', [AuthController::class, 'session'])->middleware('throttle:5,1');
    Route::post('/auth/panel-login', [AuthController::class, 'panelLogin'])->middleware('throttle:10,1');
    Route::get('/auth/gate', [AuthController::class, 'gate']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/provision/bootstrap', [ProvisionController::class, 'bootstrap']);
    Route::post('/provision/admin', [ProvisionController::class, 'admin']);
    Route::post('/provision/branding', [ProvisionController::class, 'branding']);
    Route::post('/provision/modules/install', [ProvisionController::class, 'installModule']);
    Route::match(['get', 'post'], '/provision/modules/{slug}/status', [ProvisionController::class, 'moduleStatus']);
    Route::post('/provision/license-sync', [ProvisionController::class, 'licenseSync']);
    Route::post('/provision/panel-login', [ProvisionController::class, 'panelLogin']);

    Route::prefix('public')->middleware('public.tenant')->group(function () {
        require __DIR__.'/marketplace_public.php';

        Route::get('/tenant', [PublicSiteController::class, 'tenant']);
        Route::get('/home', [PublicSiteController::class, 'home']);
        Route::get('/geo/states', [GeoController::class, 'states']);
        Route::get('/geo/cities', [GeoController::class, 'cities']);
        Route::get('/orders/{order}/pay', [PublicOrderPaymentController::class, 'show'])->whereNumber('order');
        Route::post('/orders/{order}/pay/intent', [PublicOrderPaymentController::class, 'intent'])->whereNumber('order');
        Route::get('/kernel/activations', [PublicKernelController::class, 'activations']);
        Route::get('/analytics/bootstrap', [PublicAnalyticsController::class, 'bootstrap']);
        Route::post('/analytics/hit', [PublicAnalyticsController::class, 'hit'])->middleware('throttle:180,1');

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
            Route::get('/builder/pages/{slug}', [PublicBuilderController::class, 'page']);
            Route::get('/builder/templates/{kind}', [PublicBuilderController::class, 'template']);
        });

        Route::middleware('public.module:consultations')->group(function () {
            Route::post('/consultations', [PublicConsultationController::class, 'store']);
        });

        Route::middleware('public.module:catalog')->group(function () {
            Route::get('/catalog', [PublicCatalogController::class, 'index']);
            Route::get('/catalog/items/{slug}', [PublicCatalogController::class, 'show']);
            Route::get('/catalog/items/{slug}/reviews', [ProductReviewController::class, 'publicIndex']);
            Route::post('/catalog/items/{slug}/reviews', [ProductReviewController::class, 'publicStore']);
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

    Route::middleware(['auth:sanctum', 'token.scope'])->group(function () {
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

        // Shared by every signed-in role (customer portal, storefront cart, dashboard shell).
        Route::get('/tenant', [TenantController::class, 'show']);
        Route::get('/bootstrap', [BootstrapController::class, 'show']);
        Route::get('/setup/status', [SetupController::class, 'status']);
        Route::get('/kernel/registry', [KernelController::class, 'registry']);
        Route::get('/kernel/activations', [KernelController::class, 'tenantActivations']);
        Route::get('/maps/search', [ShopExtrasController::class, 'mapsSearch']);
        Route::get('/maps/default-address', [ShopExtrasController::class, 'defaultAddress']);
        Route::get('/loyalty/rewards', [ShopExtrasController::class, 'loyaltyRewards']);
        Route::get('/loyalty/balance', [ShopExtrasController::class, 'loyaltyBalance']);
        Route::post('/loyalty/redeem', [ShopExtrasController::class, 'redeemLoyalty']);
        Route::post('/shipping/quote', [ShippingZonesController::class, 'quote']);

        Route::middleware('module:cart')->group(function () {
            Route::get('/cart', [CartController::class, 'show']);
            Route::post('/cart/items', [CartController::class, 'addItem']);
            Route::put('/cart/purchase-type', [CartController::class, 'setPurchaseType']);
            Route::delete('/cart/items/{product}', [CartController::class, 'removeItem']);
        });

        Route::middleware('module:checkout')->group(function () {
            Route::post('/checkout', [CheckoutController::class, 'store']);
            Route::post('/payments/intent', [PaymentIntentController::class, 'store']);
        });

        Route::get('/account/tickets', [SupportTicketController::class, 'accountIndex']);
        Route::post('/account/tickets', [SupportTicketController::class, 'accountCreate']);
        Route::get('/account/tickets/{ticket}', [SupportTicketController::class, 'accountShow'])->whereNumber('ticket');
        Route::patch('/account/tickets/{ticket}', [SupportTicketController::class, 'accountPatch'])->whereNumber('ticket');
        Route::post('/account/tickets/{ticket}/replies', [SupportTicketController::class, 'accountReply'])->whereNumber('ticket');

        Route::get('/account/notifications', [NotificationController::class, 'index']);
        Route::post('/account/notifications', [NotificationController::class, 'markAllRead']);
        Route::post('/account/notifications/{notification}/read', [NotificationController::class, 'markRead'])->whereNumber('notification');

        Route::prefix('account')->group(function () {
            Route::get('/overview', [AccountPortalController::class, 'overview']);
            Route::get('/orders', [AccountPortalController::class, 'ordersIndex']);
            Route::get('/orders/{order}', [AccountPortalController::class, 'ordersShow'])->whereNumber('order');
            Route::get('/addresses', [AccountPortalController::class, 'addressesShow']);
            Route::patch('/addresses', [AccountPortalController::class, 'addressesUpdate']);
            Route::get('/favorites', [AccountPortalController::class, 'favoritesIndex']);
            Route::post('/favorites/{productId}', [AccountPortalController::class, 'favoritesAdd'])->whereNumber('productId');
            Route::delete('/favorites/{productId}', [AccountPortalController::class, 'favoritesRemove'])->whereNumber('productId');
            Route::get('/reviews', [AccountPortalController::class, 'reviewsIndex']);
            Route::post('/questions', [ProductQuestionController::class, 'accountStore']);
            Route::get('/questions/products', [ProductQuestionController::class, 'accountProducts']);
            Route::get('/profile', [AccountPortalController::class, 'profileShow']);
            Route::patch('/profile', [AccountPortalController::class, 'profileUpdate']);
            Route::get('/wallet', [AccountPortalController::class, 'wallet']);
            Route::get('/wallet/ledger', [AccountPortalController::class, 'walletLedger']);
            Route::post('/wallet/topup', [AccountPortalController::class, 'walletTopup']);
            Route::post('/wallet/withdraw', [AccountPortalController::class, 'walletWithdraw']);
            Route::get('/wallet/withdrawals', [AccountPortalController::class, 'walletWithdrawals']);
            Route::get('/preferences', [AccountPortalController::class, 'preferencesShow']);
            Route::patch('/preferences', [AccountPortalController::class, 'preferencesUpdate']);
        });

        Route::middleware('staff')->group(function () {
            Route::get('/modules', [ModuleController::class, 'index']);
                Route::match(['get', 'post'], '/modules/marketplace/catalog', [ModuleMarketplaceController::class, 'catalog']);
                Route::post('/modules/marketplace/purchase', [ModuleMarketplaceController::class, 'purchase']);
                Route::match(['get', 'post'], '/modules/marketplace/payment-callback', [ModuleMarketplaceController::class, 'paymentCallback']);
            Route::patch('/modules/{slug}', [ModuleController::class, 'update']);

            Route::post('/license/sync', [LicenseController::class, 'sync']);
            Route::get('/license/status', [LicenseController::class, 'status']);

            Route::prefix('updates')->group(function () {
                Route::get('/status', [CoreUpdateController::class, 'status']);
                Route::post('/check', [CoreUpdateController::class, 'check']);
                Route::post('/download', [CoreUpdateController::class, 'download']);
                Route::post('/apply', [CoreUpdateController::class, 'apply']);
                Route::get('/backups', [CoreUpdateController::class, 'backups']);
            });

            Route::prefix('build-pipeline')->group(function () {
                Route::get('/status', [BuildPipelineController::class, 'status']);
                Route::post('/start', [BuildPipelineController::class, 'start']);
                Route::post('/cancel', [BuildPipelineController::class, 'cancel']);
            });
            Route::post('/modules/{slug}/install', [ModuleInstallController::class, 'install']);
            Route::get('/modules/{slug}/status', [ModuleInstallController::class, 'status']);

            Route::post('/setup/apply-site-type', [SetupController::class, 'applySiteType']);
            Route::patch('/setup/store', [SetupController::class, 'updateStore']);
            Route::patch('/setup/crm', [SetupController::class, 'updateCrm']);
            Route::post('/setup/sync-license', [SetupController::class, 'syncLicense']);
            Route::post('/setup/complete', [SetupController::class, 'complete']);

            Route::post('/settings/site/notifications/test-email', [TenantSettingsController::class, 'testNotificationEmail'])
                ->middleware('can:settings.manage');
            Route::get('/settings/{area}/{section}/{sub?}', [TenantSettingsController::class, 'show']);
            Route::put('/settings/{area}/{section}/{sub?}', [TenantSettingsController::class, 'update'])
                ->middleware('can:settings.manage');

            Route::get('/kernel/site-types', [KernelController::class, 'siteTypes']);
            Route::put('/loyalty/rewards', [ShopExtrasController::class, 'saveLoyaltyRewards']);

            Route::get('/product-questions', [ProductQuestionController::class, 'adminIndex']);
            Route::patch('/product-questions/{question}', [ProductQuestionController::class, 'moderate'])
                ->middleware('can:reviews.moderate')
                ->whereNumber('question');
            Route::get('/product-reviews', [ProductReviewController::class, 'adminIndex']);
            Route::patch('/product-reviews/{review}', [ProductReviewController::class, 'moderate'])
                ->middleware('can:reviews.moderate')
                ->whereNumber('review');

            Route::get('/shop/tickets', [SupportTicketController::class, 'staffIndex']);
            Route::get('/shop/tickets/{ticket}', [SupportTicketController::class, 'staffShow'])->whereNumber('ticket');
            Route::patch('/shop/tickets/{ticket}', [SupportTicketController::class, 'staffPatch'])->whereNumber('ticket');
            Route::post('/shop/tickets/{ticket}/replies', [SupportTicketController::class, 'staffReply'])->whereNumber('ticket');
            Route::post('/shop/tickets/{ticket}/convert-task', [SupportTicketController::class, 'staffConvertTask'])->whereNumber('ticket');
            Route::post('/shop/tickets/{ticket}/sync-erp', [SupportTicketController::class, 'staffSyncErp'])->whereNumber('ticket');

            Route::get('/themes', [ThemeController::class, 'index']);
            Route::post('/themes/{slug}/activate', [ThemeController::class, 'activate']);
            Route::patch('/themes/branding', [ThemeController::class, 'updateBranding']);

            Route::middleware('module:dashboard')->group(function () {
                Route::get('/analytics/summary', [AnalyticsController::class, 'summary']);
                Route::get('/dashboard/overview', [DashboardOverviewController::class, 'overview']);
                Route::get('/dashboard/sms-panel', [DashboardOverviewController::class, 'smsPanel']);
            });

            Route::middleware('module:analytics')->group(function () {
                Route::middleware('can:analytics.manage')->group(function () {
                    Route::get('/analytics/settings', [AnalyticsController::class, 'settings']);
                    Route::post('/analytics/settings', [AnalyticsController::class, 'saveSettings']);
                    Route::post('/analytics/purge-cache', [AnalyticsController::class, 'purgeCache']);
                    Route::post('/analytics/cache/purge', [AnalyticsController::class, 'purgeCache']);
                });
                Route::get('/analytics/{section}', [AnalyticsController::class, 'section'])
                    ->middleware('can:analytics.view')
                    ->where('section', 'overview|visitors|pages|referrals|geo|devices|online|commerce|compare|seo|support|content|month-summary');
            });

            Route::middleware('module:catalog')->group(function () {
                Route::apiResource('categories', CategoryController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
                Route::apiResource('product-tags', ProductTagController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::get('/products/lookup', [ProductController::class, 'lookup']);
                Route::get('/shop/products/print-labels', [OrderDocumentController::class, 'productLabels']);
                Route::post('/products/apply-english-slugs', [ProductController::class, 'applyEnglishSlugs']);
                Route::patch('/products/bulk', [ProductController::class, 'bulkUpdate']);
                Route::post('/products/bulk-sale', BulkSaleController::class);
                Route::post('/shop/products/bulk-sale', BulkSaleController::class);
                Route::post('/products/{product}/duplicate', [ProductController::class, 'duplicate'])->whereNumber('product');
                Route::put('/products/{product}/attributes', [ProductController::class, 'syncAttributes'])->whereNumber('product');
                Route::apiResource('products', ProductController::class)
                    ->only(['index', 'store', 'show', 'update', 'destroy'])
                    ->whereNumber('product');
                Route::get('/products/{product}/downloads', [ProductDownloadController::class, 'index'])->whereNumber('product');
                Route::post('/products/{product}/downloads', [ProductDownloadController::class, 'store'])->whereNumber('product');
                Route::delete('/products/{product}/downloads/{download}', [ProductDownloadController::class, 'destroy'])->whereNumber(['product', 'download']);
                Route::apiResource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('allergens', AllergenController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('menu-banners', MenuBannerController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::get('/products/{product}/modifiers', [ProductModifierController::class, 'index'])->whereNumber('product');
                Route::post('/products/{product}/modifiers', [ProductModifierController::class, 'store'])->whereNumber('product');
                Route::patch('/modifiers/{modifier}', [ProductModifierController::class, 'update'])->whereNumber('modifier');
                Route::delete('/modifiers/{modifier}', [ProductModifierController::class, 'destroy'])->whereNumber('modifier');
                Route::put('/products/{product}/allergens', [ProductModifierController::class, 'syncAllergens'])->whereNumber('product');
                Route::put('/products/{product}/media', [ProductModifierController::class, 'syncMedia'])->whereNumber('product');
                Route::get('/product-catalog/search', [ProductCatalogController::class, 'search']);
                Route::post('/product-catalog/import', [ProductCatalogController::class, 'import']);
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
                Route::get('/pricing/settings/export', [PricingController::class, 'exportSettings']);
                Route::post('/pricing/settings/import', [PricingController::class, 'importSettings']);
                Route::put('/pricing/settings/{section}', [PricingController::class, 'saveSection'])->where('section', '[a-z0-9\-]+');
                Route::get('/pricing/meta', [PricingController::class, 'meta']);
                Route::get('/pricing/stats', [PricingController::class, 'stats']);
                Route::post('/pricing/exchange/test', [PricingController::class, 'exchangeTest']);
                Route::post('/pricing/exchange/fetch', [PricingController::class, 'exchangeFetch']);
                Route::post('/pricing/products/{product}/reference-fetch', [PricingController::class, 'referenceFetch'])->whereNumber('product');
                Route::post('/pricing/recalculate', [PricingController::class, 'recalculateStart']);
                Route::get('/pricing/recalculate/state', [PricingController::class, 'recalculateState']);
                Route::patch('/pricing/bulk-products/{product}/brand', [PricingController::class, 'patchBrand'])->whereNumber('product');
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
                Route::get('/pricing/bulk-price-change/preview', [PricingController::class, 'bulkPricePreview']);
                Route::get('/pricing/bulk-price-change/state', [PricingController::class, 'bulkPriceState']);
            });

            Route::middleware('module:marketplace')->prefix('marketplace')->group(function () {
                $platforms = implode('|', array_map('preg_quote', \App\Services\Marketplace\MarketplacePlatforms::slugs()));

                Route::get('/hub', [MarketplaceController::class, 'hub']);
                Route::get('/pricing', [MarketplaceController::class, 'pricing']);
                Route::put('/pricing', [MarketplaceController::class, 'savePricing']);
                Route::get('/pricing/preview/{product}', [MarketplaceController::class, 'pricingPreview'])->whereNumber('product');

                Route::get('/products/{product}/maps', [MarketplaceController::class, 'maps'])->whereNumber('product');
                Route::post('/products/{product}/maps', [MarketplaceController::class, 'saveMaps'])->whereNumber('product');
                Route::post('/products/{product}/sync-now', [MarketplaceController::class, 'syncProduct'])->whereNumber('product');
                Route::post('/products/{product}/create-remote', [MarketplaceController::class, 'createRemote'])->whereNumber('product');
                Route::put('/products/{product}/platform-prices', [MarketplaceController::class, 'savePlatformPrices'])->whereNumber('product');

                Route::delete('/maps/{map}', [MarketplaceController::class, 'deleteMap'])->whereNumber('map');
                Route::post('/maps/{map}/push', [MarketplaceController::class, 'pushMap'])->whereNumber('map');
                Route::post('/jobs/{job}/retry', [MarketplaceController::class, 'retryJob'])->whereNumber('job');
                Route::post('/jobs/{job}/cancel', [MarketplaceController::class, 'cancelJob'])->whereNumber('job');

                require __DIR__.'/marketplace_platforms.php';

                Route::get('/{platform}/settings', [MarketplaceController::class, 'settings'])->where('platform', $platforms);
                Route::post('/{platform}/settings', [MarketplaceController::class, 'saveSettings'])->where('platform', $platforms);
                Route::post('/{platform}/test-connection', [MarketplaceController::class, 'testConnection'])->where('platform', $platforms);
                Route::post('/{platform}/sync-now', [MarketplaceController::class, 'syncNow'])->where('platform', $platforms);
                Route::post('/{platform}/pull-orders', [MarketplaceController::class, 'pullOrders'])->where('platform', $platforms);
                Route::get('/{platform}/maps', [MarketplaceController::class, 'platformMaps'])->where('platform', $platforms);
                Route::get('/{platform}/jobs', [MarketplaceController::class, 'jobs'])->where('platform', $platforms);
                Route::get('/{platform}/logs', [MarketplaceController::class, 'logs'])->where('platform', $platforms);
                Route::delete('/{platform}/logs', [MarketplaceController::class, 'clearLogs'])->where('platform', $platforms);
                Route::get('/{platform}/orders', [MarketplaceController::class, 'orders'])->where('platform', $platforms);
                Route::get('/{platform}/search', [MarketplaceController::class, 'search'])->where('platform', $platforms);
                Route::get('/{platform}/feed-url', [MarketplaceController::class, 'feedUrls'])->where('platform', $platforms);
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
                Route::get('/orders/{order}/print', [OrderDocumentController::class, 'print'])->whereNumber('order');
                Route::get('/orders/print-labels', [OrderDocumentController::class, 'labels']);
            });

            Route::middleware(['module:pos', 'can:pos.use'])->group(function () {
                Route::get('/products/pos-search', [OrderController::class, 'posSearch']);
                Route::get('/pos/customers', [OrderController::class, 'posCustomers']);
                Route::get('/payment-gateways', [OrderController::class, 'paymentGateways']);
                Route::post('/pos/orders', [OrderController::class, 'store']);
                Route::get('/pos/orders/{order}/print', [OrderDocumentController::class, 'print'])->whereNumber('order');
            });

            Route::middleware('module:c2c')->group(function () {
                Route::get('/c2c/settings', [C2cController::class, 'settings']);
                Route::put('/c2c/settings', [C2cController::class, 'updateSettings']);
                Route::get('/c2c/receipts', [C2cController::class, 'receipts']);
                Route::post('/c2c/receipts/{order}', [C2cController::class, 'decide'])->whereNumber('order');
            });

            Route::get('/payments/hub', [PaymentsHubController::class, 'show']);
            Route::post('/payments/hub', [PaymentsHubController::class, 'update']);
            Route::post('/payments/hub/{gateway}/toggle', [PaymentsHubController::class, 'toggle']);
            Route::get('/payments/gateways/{provider}', [PaymentGatewaySettingsController::class, 'show']);
            Route::post('/payments/gateways/{provider}', [PaymentGatewaySettingsController::class, 'update']);

            Route::get('/shipping/zones', [ShippingZonesController::class, 'index']);
            Route::post('/shipping/zones/global', [ShippingZonesController::class, 'saveGlobal']);
            Route::post('/shipping/zones', [ShippingZonesController::class, 'storeZone']);
            Route::put('/shipping/zones/{zone}', [ShippingZonesController::class, 'updateZone'])->whereNumber('zone');
            Route::delete('/shipping/zones/{zone}', [ShippingZonesController::class, 'destroyZone'])->whereNumber('zone');
            Route::post('/shipping/zones/{zone}/methods', [ShippingZonesController::class, 'storeMethod'])->whereNumber('zone');
            Route::put('/shipping/zones/{zone}/methods/{method}', [ShippingZonesController::class, 'updateMethod'])->whereNumber(['zone', 'method']);
            Route::delete('/shipping/zones/{zone}/methods/{method}', [ShippingZonesController::class, 'destroyMethod'])->whereNumber(['zone', 'method']);

            Route::get('/shipping/tapin', [TapinController::class, 'show']);
            Route::post('/shipping/tapin', [TapinController::class, 'update']);
            Route::post('/shipping/tapin/test', [TapinController::class, 'testConnection']);
            Route::get('/shipping/tapin/shops', [TapinController::class, 'shops']);
            Route::post('/shipping/tapin/sync-locations', [TapinController::class, 'syncLocations']);
            Route::get('/shipping/tapin/credit', [TapinController::class, 'credit']);
            Route::post('/orders/{order}/tapin/register', [TapinController::class, 'registerOrder'])->whereNumber('order');
            Route::post('/orders/{order}/tapin/status', [TapinController::class, 'orderStatus'])->whereNumber('order');
            Route::get('/orders/{order}/tapin/label', [TapinController::class, 'orderLabel'])->whereNumber('order');
            Route::get('/zarinpal/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->show($r, 'zarinpal'));
            Route::post('/zarinpal/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->update($r, 'zarinpal'));
            Route::get('/digipay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->show($r, 'digipay'));
            Route::post('/digipay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->update($r, 'digipay'));
            Route::get('/snapppay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->show($r, 'snapppay'));
            Route::post('/snapppay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->update($r, 'snapppay'));
            Route::get('/torobpay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->show($r, 'torobpay'));
            Route::post('/torobpay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->update($r, 'torobpay'));
            Route::get('/bale-pay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->show($r, 'bale-pay'));
            Route::post('/bale-pay/settings', fn (\Illuminate\Http\Request $r) => app(PaymentGatewaySettingsController::class)->update($r, 'bale-pay'));

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

            Route::middleware('module:inventory')->group(function () {
                Route::get('/inventory/summary', [InventoryController::class, 'summary']);
            });

            Route::middleware(['module:reports', 'can:reports.shop'])->group(function () {
                Route::get('/reports/{section}', [ReportsController::class, 'section'])
                    ->where('section', 'overview|revenue|orders|products|variations|categories|brands|coupons|taxes|customers|downloads|stock|sales|financial');
                Route::get('/reports/{section}/export', [ReportsController::class, 'export'])
                    ->where('section', 'overview|revenue|orders|products|variations|categories|brands|coupons|taxes|customers|downloads|stock|sales|financial');
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
                    Route::get('/logs', fn (\Illuminate\Http\Request $r) => app(BotController::class)->logs($r, $provider));
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
                Route::get('/cms/pages/{page}', [CmsController::class, 'show'])->whereNumber('page');
                Route::patch('/cms/pages/{page}', [CmsController::class, 'update'])->whereNumber('page');
                Route::delete('/cms/pages/{page}', [CmsController::class, 'destroy'])->whereNumber('page');
                Route::get('/cms/home-blocks', [CmsController::class, 'homeBlocks']);
                Route::put('/cms/home-blocks', [CmsController::class, 'updateHomeBlocks']);
                Route::get('/builder', [BuilderController::class, 'index']);
                Route::post('/builder/pages', [BuilderController::class, 'store']);
                Route::get('/builder/pages/{page}', [BuilderController::class, 'show'])->whereNumber('page');
                Route::patch('/builder/pages/{page}', [BuilderController::class, 'update'])->whereNumber('page');
                Route::post('/builder/pages/{page}/publish', [BuilderController::class, 'publish'])->whereNumber('page');
                Route::delete('/builder/pages/{page}', [BuilderController::class, 'destroy'])->whereNumber('page');
                Route::get('/builder/templates/{kind}', [BuilderController::class, 'showTemplate']);
                Route::put('/builder/templates/{kind}', [BuilderController::class, 'saveTemplate']);
                Route::post('/builder/templates/{kind}/publish', [BuilderController::class, 'publishTemplate']);
                Route::post('/import/wordpress/probe', [WordpressImportController::class, 'probe']);
                Route::post('/import/wordpress/start', [WordpressImportController::class, 'start']);
                Route::post('/import/wordpress/ingest', [WordpressImportController::class, 'ingest']);
                Route::get('/import/wordpress/jobs', [WordpressImportController::class, 'index']);
                Route::get('/import/wordpress/jobs/{job}', [WordpressImportController::class, 'show'])->whereNumber('job');
                Route::patch('/import/wordpress/jobs/{job}', [WordpressImportController::class, 'update'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/batches', [WordpressImportController::class, 'batches'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/upload', [WordpressImportController::class, 'upload'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/run', [WordpressImportController::class, 'run'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/pause', [WordpressImportController::class, 'pause'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/resume', [WordpressImportController::class, 'resume'])->whereNumber('job');
                Route::post('/import/wordpress/jobs/{job}/retry', [WordpressImportController::class, 'retry'])->whereNumber('job');
                Route::get('/import/wordpress/tokens', [WordpressImportController::class, 'tokens']);
                Route::post('/import/wordpress/tokens', [WordpressImportController::class, 'storeToken'])->middleware('throttle:10,1');
                Route::delete('/import/wordpress/tokens/{token}', [WordpressImportController::class, 'destroyToken'])->whereNumber('token');
            });

            Route::middleware('module:blog')->group(function () {
                Route::get('/blog/posts', [BlogPostController::class, 'index']);
                Route::post('/blog/posts', [BlogPostController::class, 'store']);
                Route::get('/blog/posts/{post}', [BlogPostController::class, 'show'])->whereNumber('post');
                Route::patch('/blog/posts/{post}', [BlogPostController::class, 'update'])->whereNumber('post');
                Route::delete('/blog/posts/{post}', [BlogPostController::class, 'destroy'])->whereNumber('post');
                Route::get('/blog/categories', [BlogCategoryController::class, 'index']);
                Route::post('/blog/categories', [BlogCategoryController::class, 'store']);
                Route::patch('/blog/categories/{id}', [BlogCategoryController::class, 'update'])->whereNumber('id');
                Route::delete('/blog/categories/{id}', [BlogCategoryController::class, 'destroy'])->whereNumber('id');
            });

            Route::middleware('module:media')->group(function () {
                Route::get('/media', [MediaController::class, 'index']);
                Route::post('/media', [MediaController::class, 'store']);
                Route::patch('/media/{id}', [MediaController::class, 'update'])->whereNumber('id');
                Route::delete('/media/{id}', [MediaController::class, 'destroy'])->whereNumber('id');
                Route::get('/media/terms', [MediaTermController::class, 'index']);
                Route::post('/media/terms', [MediaTermController::class, 'store']);
                Route::patch('/media/terms/{id}', [MediaTermController::class, 'update'])->whereNumber('id');
                Route::delete('/media/terms/{id}', [MediaTermController::class, 'destroy'])->whereNumber('id');
            });

            Route::middleware('module:magazine')->group(function () {
                Route::get('/magazine/articles', [MagazineArticleController::class, 'index']);
                Route::post('/magazine/articles', [MagazineArticleController::class, 'store']);
                Route::get('/magazine/articles/{article}', [MagazineArticleController::class, 'show'])->whereNumber('article');
                Route::patch('/magazine/articles/{article}', [MagazineArticleController::class, 'update'])->whereNumber('article');
                Route::delete('/magazine/articles/{article}', [MagazineArticleController::class, 'destroy'])->whereNumber('article');
                Route::get('/magazine/categories', [MagazineTaxonomyController::class, 'categories']);
                Route::post('/magazine/categories', [MagazineTaxonomyController::class, 'storeCategory']);
                Route::patch('/magazine/categories/{id}', [MagazineTaxonomyController::class, 'updateCategory'])->whereNumber('id');
                Route::delete('/magazine/categories/{id}', [MagazineTaxonomyController::class, 'destroyCategory'])->whereNumber('id');
                Route::get('/magazine/tags', [MagazineTaxonomyController::class, 'tags']);
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

            Route::middleware(['module:customers', 'can:users.manage'])->group(function () {
                Route::get('/users', [UserAdminController::class, 'index']);
                Route::post('/users', [UserAdminController::class, 'store']);
                Route::post('/users/bulk-role', [UserAdminController::class, 'bulkRole']);
                Route::get('/users/{user}', [UserAdminController::class, 'show'])->whereNumber('user');
                Route::patch('/users/{user}', [UserAdminController::class, 'update'])->whereNumber('user');
                Route::delete('/users/{user}', [UserAdminController::class, 'destroy'])->whereNumber('user');
                Route::post('/users/{user}/reset-password', [UserAdminController::class, 'resetPassword'])->whereNumber('user');
                Route::post('/users/{user}/send-message', [UserAdminController::class, 'sendMessage'])->whereNumber('user');

                Route::get('/customers', [CustomerController::class, 'index']);
                Route::post('/customers', [CustomerController::class, 'store']);
                Route::patch('/customers/{customer}', [CustomerController::class, 'update'])->whereNumber('customer');
                Route::get('/customers/{customer}/notes', [CustomerNoteController::class, 'index'])->whereNumber('customer');
                Route::post('/customers/{customer}/notes', [CustomerNoteController::class, 'store'])->whereNumber('customer');
                Route::delete('/customers/{customer}/notes/{note}', [CustomerNoteController::class, 'destroy'])->whereNumber('customer')->whereNumber('note');
            });

            Route::middleware(['module:staff', 'can:users.manage'])->group(function () {
                Route::get('/staff', [StaffController::class, 'index']);
                Route::post('/staff', [StaffController::class, 'store']);
                Route::patch('/staff/{staff}', [StaffController::class, 'update'])->whereNumber('staff');
            });

            Route::middleware(['module:rbac', 'can:rbac.manage'])->group(function () {
                Route::get('/roles', [RoleController::class, 'index']);
                Route::put('/roles', [RoleController::class, 'update']);
                Route::put('/roles/capabilities', [RoleController::class, 'updateCapabilities']);
                Route::get('/roles/menu-acl', [RoleController::class, 'menuAclIndex']);
                Route::put('/roles/menu-acl', [RoleController::class, 'menuAclUpdate']);
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

            Route::middleware('module:ai-content')->group(function () {
                Route::get('/ai-content/overview', [AiContentController::class, 'overview']);
                Route::get('/ai-content/settings', [AiContentController::class, 'settings']);
                Route::post('/ai-content/settings', [AiContentController::class, 'saveSettings']);
                Route::get('/ai-content/gapgpt/models', [AiContentController::class, 'gapgptModels']);
                Route::post('/ai-content/cost-estimate', [AiContentController::class, 'costEstimate']);
                Route::get('/ai-content/jobs', [AiContentController::class, 'jobs']);
                Route::get('/ai-content/jobs/{job}', [AiContentController::class, 'job'])->whereNumber('job');
                Route::post('/ai-content/jobs/{job}/retry', [AiContentController::class, 'retryJob'])->whereNumber('job');
                Route::post('/ai-content/jobs/{job}/cancel', [AiContentController::class, 'cancelJob'])->whereNumber('job');
                Route::post('/ai-content/jobs/{job}/run', [AiContentController::class, 'runOne'])->whereNumber('job');
                Route::post('/ai-content/jobs/run-due', [AiContentController::class, 'runDue']);
                Route::post('/ai-content/jobs/cancel-pending', [AiContentController::class, 'cancelPending']);
                Route::get('/ai-content/queue', [AiContentController::class, 'queueGet']);
                Route::post('/ai-content/queue', [AiContentController::class, 'queuePost']);
                Route::post('/ai-content/generate', [AiContentController::class, 'generate']);
                Route::get('/ai-content/products/incomplete', [AiContentController::class, 'productsIncomplete']);
                Route::post('/ai-content/products/fill-batch', [AiContentController::class, 'productsFillBatch']);
                Route::get('/ai-content/calendar', [AiContentController::class, 'calendarList']);
                Route::post('/ai-content/calendar', [AiContentController::class, 'calendarCreate']);
                Route::post('/ai-content/calendar/bulk', [AiContentController::class, 'calendarBulk']);
                Route::patch('/ai-content/calendar/{id}', [AiContentController::class, 'calendarPatch'])->whereNumber('id');
                Route::delete('/ai-content/calendar/{id}', [AiContentController::class, 'calendarDelete'])->whereNumber('id');
                Route::post('/ai-content/calendar/run-due', [AiContentController::class, 'calendarRunDue']);
                Route::get('/ai-content/attribute-templates', [AiContentController::class, 'attrList']);
                Route::post('/ai-content/attribute-templates', [AiContentController::class, 'attrConfirm']);
                Route::delete('/ai-content/attribute-templates/{id}', [AiContentController::class, 'attrDelete'])->whereNumber('id');
                Route::post('/ai-content/suggest-categories', [AiContentController::class, 'suggestCategories']);
                Route::get('/ai-content/blog-topics', [AiContentController::class, 'blogTopics']);
                Route::post('/ai-content/blog-topics/suggest', [AiContentController::class, 'blogTopicsSuggest']);
                Route::post('/ai-content/blog-topics/approve', [AiContentController::class, 'blogTopicsApprove']);
                Route::post('/ai-content/blog-topics/skip', [AiContentController::class, 'blogTopicsSkip']);
                Route::get('/ai-content/proposals', [AiContentController::class, 'proposals']);
                Route::post('/ai-content/proposals/enqueue', [AiContentController::class, 'proposalsEnqueue']);
                Route::post('/ai-content/proposals/{id}/apply', [AiContentController::class, 'proposalsApply'])->whereNumber('id');
                Route::post('/ai-content/proposals/{id}/skip', [AiContentController::class, 'proposalsSkip'])->whereNumber('id');
                Route::post('/ai-content/terms/fill-batch', [AiContentController::class, 'termsFillBatch']);
            });

            Route::middleware('module:ai_recommendations')->group(function () {
                Route::post('/ai/recommendations', [AiRecommendationController::class, 'store']);
            });

            Route::middleware(['module:accounting', 'can:accounting.manage'])->group(function () {
                Route::get('/accounting/status', [AccountingController::class, 'status']);
                Route::get('/accounting/overview', [AccountingController::class, 'overview']);
                Route::get('/accounting/ledger', [AccountingController::class, 'ledger']);
                Route::get('/accounting/journals', [AccountingController::class, 'journalsIndex']);
                Route::post('/accounting/journals', [AccountingController::class, 'journalsStore']);
                Route::get('/accounting/persons', [AccountingController::class, 'personsIndex']);
                Route::post('/accounting/persons', [AccountingController::class, 'personsStore']);
                Route::get('/accounting/accounts', [AccountingController::class, 'accountsIndex']);
                Route::post('/accounting/accounts', [AccountingController::class, 'accountsStore']);
            });
        });
    });
});
