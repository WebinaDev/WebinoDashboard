<?php

use App\Http\Controllers\Api\V1\AcademyCourseController;
use App\Http\Controllers\Api\V1\AccountingController;
use App\Http\Controllers\Api\V1\AiRecommendationController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AnnouncementController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BlogPostController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\CmsController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\LicenseController;
use App\Http\Controllers\Api\V1\MarketingController;
use App\Http\Controllers\Api\V1\MobileContractController;
use App\Http\Controllers\Api\V1\ModuleController;
use App\Http\Controllers\Api\V1\ModuleInstallController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentCallbackController;
use App\Http\Controllers\Api\V1\PaymentIntentController;
use App\Http\Controllers\Api\V1\PortfolioItemController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProvisionController;
use App\Http\Controllers\Api\V1\PublicAcademyController;
use App\Http\Controllers\Api\V1\PublicBlogController;
use App\Http\Controllers\Api\V1\PublicCmsController;
use App\Http\Controllers\Api\V1\PublicConsultationController;
use App\Http\Controllers\Api\V1\PublicCorporateController;
use App\Http\Controllers\Api\V1\PublicPortfolioController;
use App\Http\Controllers\Api\V1\PublicSiteController;
use App\Http\Controllers\Api\V1\ReportsController;
use App\Http\Controllers\Api\V1\SetupController;
use App\Http\Controllers\Api\V1\SiteConsultationController;
use App\Http\Controllers\Api\V1\TeamMemberController;
use App\Http\Controllers\Api\V1\TenantController;
use App\Http\Controllers\Api\V1\TestimonialController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/payments/callback/{provider}/{order}', [PaymentCallbackController::class, 'handle'])
        ->whereNumber('order');

    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/session', [AuthController::class, 'session']);
    Route::get('/auth/gate', [AuthController::class, 'gate']);
    Route::post('/provision/bootstrap', [ProvisionController::class, 'bootstrap']);

    Route::prefix('public')->middleware('public.tenant')->group(function () {
        Route::get('/tenant', [PublicSiteController::class, 'tenant']);
        Route::get('/home', [PublicSiteController::class, 'home']);

        Route::get('/blog', [PublicBlogController::class, 'index']);
        Route::get('/blog/category/{slug}', [PublicBlogController::class, 'category']);
        Route::get('/blog/{slug}', [PublicBlogController::class, 'show']);

        Route::get('/academy', [PublicAcademyController::class, 'index']);
        Route::get('/academy/{slug}', [PublicAcademyController::class, 'show']);

        Route::get('/portfolio', [PublicPortfolioController::class, 'index']);
        Route::get('/portfolio/{slug}', [PublicPortfolioController::class, 'show']);

        Route::get('/announcements', [PublicCorporateController::class, 'announcements']);
        Route::get('/testimonials', [PublicCorporateController::class, 'testimonials']);
        Route::get('/team', [PublicCorporateController::class, 'team']);

        Route::get('/pages/{slug}', [PublicCmsController::class, 'page']);
        Route::post('/consultations', [PublicConsultationController::class, 'store']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/check', [AuthController::class, 'check']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/user', [AuthController::class, 'user']);

        Route::get('/modules', [ModuleController::class, 'index']);
        Route::patch('/modules/{slug}', [ModuleController::class, 'update']);

        Route::post('/license/sync', [LicenseController::class, 'sync']);
        Route::post('/modules/{slug}/install', [ModuleInstallController::class, 'install']);

        Route::get('/setup/status', [SetupController::class, 'status']);
        Route::patch('/setup/store', [SetupController::class, 'updateStore']);
        Route::patch('/setup/crm', [SetupController::class, 'updateCrm']);
        Route::post('/setup/sync-license', [SetupController::class, 'syncLicense']);
        Route::post('/setup/complete', [SetupController::class, 'complete']);

        Route::get('/tenant', [TenantController::class, 'show']);

        Route::middleware('module:dashboard')->group(function () {
            Route::get('/analytics/summary', [AnalyticsController::class, 'summary']);
        });

        Route::middleware('module:catalog')->group(function () {
            Route::apiResource('categories', CategoryController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('products', ProductController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::get('/orders', [OrderController::class, 'index']);
            Route::get('/orders/{order}', [OrderController::class, 'show'])->whereNumber('order');
            Route::patch('/orders/{order}', [OrderController::class, 'update'])->whereNumber('order');
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
