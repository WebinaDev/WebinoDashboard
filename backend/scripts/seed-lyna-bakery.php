<?php

/**
 * Lyna Bakery — distinct bakery identity + product catalogue (not a Limbo twin).
 * Usage: php scripts/seed-lyna-bakery.php
 */

use App\Kernel\ThemeCatalog;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\StorefrontAppearanceService;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();

$tenant = Tenant::query()->first();
if (! $tenant) {
    fwrite(STDERR, "No tenant\n");
    exit(1);
}
$tid = (int) $tenant->id;
$settings = $app->make(ModuleSettingsService::class);
$TAG = 'lyna-bakery';
$IMG = '/themes/cafe-demo/items';

/** Cocoa + pistachio bakery — not cream/terracotta cliché. */
const PALETTE = [
    'primary' => '#7a9b76',
    'secondary' => '#5c2e24',
    'accent' => '#c47a4a',
    'bg' => '#f7efe6',
    'surface' => '#fffaf4',
    'text' => '#2a1a14',
    'muted' => '#6b5348',
    'text3' => '#9a8174',
    'navy' => '#3a241c',
    'header' => '#3a241c',
    'footer' => '#2a1a14',
    'border' => '#e4d4c4',
];

$categories = [
    'bread' => ['نان تازه', 'cafe', 'bread'],
    'pastries' => ['شیرینی تر', 'cafe', 'brownie'],
    'cakes' => ['کیک و تارت', 'cafe', 'chocolate-cake'],
    'cookies' => ['کوکی و بیسکویت', 'cafe', 'brownie'],
    'hot-drinks' => ['نوشیدنی گرم', 'cafe', 'latte'],
    'cold-drinks' => ['نوشیدنی سرد', 'cold-bar', 'iced-latte'],
];

$items = [
    ['bread', 'نان باگت ترد', 'باگت روزانه از خمیر تخمیر طولانی', 85000, 'bread'],
    ['bread', 'نان سبوس چندغله', 'نان سبوس‌دار با دانه کنجد و کتان', 95000, 'bread'],
    ['bread', 'نان شکلاتی', 'نان نرم با تکه‌های شکلات تلخ', 120000, 'brownie'],
    ['bread', 'نان سیر و پنیر', 'نان تنوری با کره سیر و پنیر', 110000, 'bread'],
    ['pastries', 'کروسان کره‌ای', 'کروسان لایه‌لایه با کره فرانسوی', 145000, 'pancake'],
    ['pastries', 'پینویر شکلات', 'پفک شکلاتی با مغز کاکائو', 155000, 'brownie'],
    ['pastries', 'دانیس آلبالو', 'خمیر دانمارکی با آلبالوی ترش', 150000, 'panna-cotta'],
    ['pastries', 'پیراشکی سیب دارچین', 'پیراشکی گرم با سیب و دارچین', 135000, 'pancake'],
    ['cakes', 'چیزکیک نیویورکی', 'برش چیزکیک کلاسیک با بیسکویت', 220000, 'panna-cotta'],
    ['cakes', 'کیک هویج گردو', 'کیک هویج مرطوب با کرم پنیر', 195000, 'chocolate-cake'],
    ['cakes', 'تارت لیمو', 'تارت لیمو با مرنگ سبک', 210000, 'panna-cotta'],
    ['cakes', 'براونی فاج', 'براونی غلیظ شکلات تلخ', 175000, 'brownie'],
    ['cookies', 'کوکی شکلات چیپسی', 'کوکی نرم با چیپس شکلات', 95000, 'brownie'],
    ['cookies', 'کوکی جو دوسر کشمش', 'کوکی جو با کشمش و دارچین', 90000, 'brownie'],
    ['cookies', 'ماکارون پسته', 'ماکارون فرانسوی با مغز پسته', 180000, 'panna-cotta'],
    ['hot-drinks', 'اسپرسو دبل', 'شات دوبل اسپرسو تازه', 120000, 'espresso'],
    ['hot-drinks', 'کاپوچینو', 'اسپرسو با فوم مخملی', 165000, 'cappuccino'],
    ['hot-drinks', 'لاته وانیل', 'لاته با سیروپ وانیل خانگی', 185000, 'latte'],
    ['hot-drinks', 'هات چاکلت لاینا', 'شکلات داغ با کاکائوی تلخ', 175000, 'mocha-frappe'],
    ['hot-drinks', 'چای ماسالا', 'چای ادویه‌ای با شیر', 145000, 'masala-chai'],
    ['cold-drinks', 'آیس لاته', 'لاته سرد روی یخ', 175000, 'iced-latte'],
    ['cold-drinks', 'شیک موز کارامل', 'شیک موز با کارامل خانگی', 195000, 'mocha-frappe'],
    ['cold-drinks', 'لیموناد ریحان', 'لیموناد تازه با برگ ریحان', 145000, 'iced-tea'],
    ['cold-drinks', 'اسموتی توت‌فرنگی', 'اسموتی توت‌فرنگی و ماست', 185000, 'panna-cotta'],
];

DB::transaction(function () use ($tid, $tenant, $settings, $TAG, $IMG, $categories, $items, $app) {
    Product::query()->where('tenant_id', $tid)->where('meta->seed', 'cafe-demo')->update([
        'is_hidden' => true,
        'status' => 'draft',
        'catalog_visibility' => 'hidden',
    ]);

    $menuIds = [];
    foreach ([
        'cafe' => ['قنادی', 'cafe', 'نان، شیرینی و کیک تازه'],
        'cold-bar' => ['بار سرد', 'bar', 'نوشیدنی‌های سرد'],
    ] as $slug => [$name, $type, $desc]) {
        $menuIds[$slug] = (int) Menu::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            ['name' => $name, 'menu_type' => $type, 'locale' => 'fa', 'is_active' => true, 'description' => $desc],
        )->id;
    }

    $catIds = [];
    $i = 0;
    foreach ($categories as $slug => [$name, $menu]) {
        $catIds[$slug] = (int) Category::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            ['name' => $name, 'sort_order' => $i++, 'is_active' => true, 'meta' => ['seed' => $TAG]],
        )->id;
    }

    $order = 0;
    foreach ($items as [$cat, $name, $desc, $price, $img]) {
        $slug = 'lyna-'.($order + 1).'-'.preg_replace('/\s+/', '-', $cat);
        Product::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug.'-'.md5($name)],
            [
                'category_id' => $catIds[$cat],
                'menu_id' => $menuIds[$categories[$cat][1]] ?? $menuIds['cafe'],
                'name' => $name,
                'description' => $desc,
                'short_description' => $desc,
                'image_url' => $IMG.'/'.$img.'.webp',
                'cover_image_url' => $IMG.'/'.$img.'.webp',
                'price_minor' => $price * 10,
                'currency' => 'IRR',
                'stock' => 40,
                'manage_stock' => false,
                'stock_status' => 'instock',
                'is_available' => true,
                'is_hidden' => false,
                'is_featured' => $order < 6,
                'sort_order' => $order++,
                'status' => 'publish',
                'type' => 'simple',
                'catalog_visibility' => 'visible',
                'meta' => ['seed' => $TAG],
            ],
        );
    }

    $settings->put($tid, 'cafe', 'venue', array_merge(
        $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
        [
            'tagline_fa' => 'نان تازه صبح، کیک عصر، قهوهٔ آرام',
            'about_fa' => "قنادی لاینا جایی‌ست برای بوی نان تنور و ویترین شیرینی‌های روز.\nهر صبح خمیرها از نو شروع می‌شوند؛ کیک‌ها با دستور خانگی و قهوه‌ها برای نشستن‌های کوتاه و قرارهای شیرین.",
            'phone' => null,
            'address_fa' => 'تهران',
            'mini_site_enabled' => true,
        ],
    ));
    $days = [];
    foreach (['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as $day) {
        $days[] = ['day' => $day, 'open' => '08:00', 'close' => $day === 'friday' ? '22:00' : '22:30', 'closed' => false];
    }
    $settings->put($tid, 'cafe', 'hours', ['timezone' => 'Asia/Tehran', 'days' => $days, 'closed_dates' => []]);
    $settings->put($tid, 'cafe', 'menu', array_merge(
        $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
        [
            'accent_color' => PALETTE['primary'],
            'header_cta_label_fa' => 'سفارش از ویترین',
            'header_cta_url' => '/menu',
            'placeholder_logo_text_fa' => 'LYNA',
        ],
    ));
    $settings->put($tid, 'cafe', 'gallery', [
        'images' => [
            ['url' => $IMG.'/pancake.webp', 'caption_fa' => 'ویترین صبحگاهی', 'sort_order' => 0],
            ['url' => $IMG.'/chocolate-cake.webp', 'caption_fa' => 'کیک‌های روز', 'sort_order' => 1],
            ['url' => $IMG.'/latte.webp', 'caption_fa' => 'قهوه کنار نان تازه', 'sort_order' => 2],
            ['url' => $IMG.'/brownie.webp', 'caption_fa' => 'شیرینی‌های عصر', 'sort_order' => 3],
        ],
    ]);

    $tenant->name = 'قنادی لاینا';
    $tenant->store_display_name = 'Lyna Bakery';
    $tenant->active_theme_slug = 'cafe-signature';
    $tenant->site_type_slug = 'cafe';
    $branding = ThemeCatalog::normalizeBranding($tenant->branding);
    $branding['accent'] = 'custom';
    $branding['palette'] = array_merge($branding['palette'] ?? [], PALETTE);
    $branding['font'] = 'vazirmatn';
    $branding['font_heading'] = 'vazirmatn';
    $tenant->branding = ThemeCatalog::mergeIntoExisting($tenant->branding, $branding);
    $tenant->save();

    $app->make(StorefrontAppearanceService::class)->save($tid, [
        'primary_color' => PALETTE['primary'],
        'secondary_color' => PALETTE['secondary'],
        'accent_color' => PALETTE['accent'],
        'text1_color' => PALETTE['text'],
        'text2_color' => PALETTE['muted'],
        'text3_color' => PALETTE['text3'],
        'navy_color' => PALETTE['navy'],
        'surface_color' => PALETTE['surface'],
        'header_bg' => PALETTE['header'],
        'footer_bg' => PALETTE['footer'],
        'border_color' => PALETTE['border'],
    ]);

    echo "Lyna bakery seeded: {$order} items in ".count($catIds)." categories\n";
});

foreach (['venue', 'menu', 'hours', 'gallery', 'engagement'] as $sub) {
    Cache::forget("module_settings:{$tid}:cafe.{$sub}");
}
