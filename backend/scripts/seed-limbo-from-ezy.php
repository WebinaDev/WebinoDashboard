<?php

/**
 * Import Limbo Cafe/Restaurant menu scraped from ezy.company (limbores + limborestaurant).
 * Usage: php scripts/seed-limbo-from-ezy.php [/path/to/limbo_menu_import.json]
 */

use App\Kernel\ThemeCatalog;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\Menu;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\StorefrontAppearanceService;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();

$jsonPath = $argv[1] ?? '/tmp/limbo_menu_import.json';
if (! is_file($jsonPath)) {
    fwrite(STDERR, "Missing menu JSON: {$jsonPath}\n");
    exit(1);
}
$payload = json_decode((string) file_get_contents($jsonPath), true);
if (! is_array($payload) || empty($payload['items'])) {
    fwrite(STDERR, "Invalid menu JSON\n");
    exit(1);
}

$tenant = Tenant::query()->first();
if (! $tenant) {
    fwrite(STDERR, "No tenant\n");
    exit(1);
}
$tid = (int) $tenant->id;
$settings = $app->make(ModuleSettingsService::class);
$TAG = 'limbo-ezy';

/** Western saloon palette from Limbo brand (black logo + brass/rust cues). */
const PALETTE = [
    'primary' => '#d4a84b',
    'secondary' => '#8b2e1f',
    'accent' => '#d4a84b',
    'bg' => '#140f0c',
    'surface' => '#211912',
    'text' => '#f4eadc',
    'muted' => '#bba896',
    'text3' => '#8a7a68',
    'navy' => '#1a120e',
    'header' => '#0e0a08',
    'footer' => '#0e0a08',
    'border' => '#3a2c22',
];

DB::transaction(function () use ($tid, $payload, $tenant, $settings, $TAG, $app) {
    // Hide previous demo products so catalogue shows real Limbo items.
    Product::query()->where('tenant_id', $tid)->where('meta->seed', 'cafe-demo')->update([
        'is_hidden' => true,
        'status' => 'draft',
        'catalog_visibility' => 'hidden',
    ]);

    $menuIds = [];
    foreach ([
        'cafe' => ['کافه', 'cafe', 'قهوه، دمنوش و نوشیدنی‌های لیمبو'],
        'cold-bar' => ['بار سرد', 'bar', 'قهوه سرد، شیک و اسموتی'],
        'kitchen' => ['رستوران', 'restaurant', 'برگر، پیتزا و غذای گرم'],
    ] as $slug => [$name, $type, $desc]) {
        $menuIds[$slug] = (int) Menu::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            ['name' => $name, 'menu_type' => $type, 'locale' => 'fa', 'is_active' => true, 'description' => $desc],
        )->id;
    }

    $catIds = [];
    $sort = 0;
    foreach ($payload['categories'] as $cat) {
        $slug = (string) $cat['slug'];
        $catIds[$slug] = (int) Category::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            [
                'name' => (string) $cat['name'],
                'description' => 'منوی لیمبو',
                'sort_order' => $sort++,
                'is_active' => true,
                'meta' => ['seed' => $TAG, 'menu' => $cat['menu'] ?? 'cafe'],
            ],
        )->id;
    }

    $order = 0;
    foreach ($payload['items'] as $item) {
        $catSlug = (string) $item['cat'];
        $menuSlug = (string) ($item['menu'] ?? 'cafe');
        $priceToman = (int) $item['price'];
        Product::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => (string) $item['slug']],
            [
                'category_id' => $catIds[$catSlug] ?? null,
                'menu_id' => $menuIds[$menuSlug] ?? $menuIds['cafe'],
                'name' => (string) $item['name'],
                'english_name' => null,
                'description' => (string) ($item['desc'] ?? ''),
                'short_description' => (string) ($item['desc'] ?? ''),
                'image_url' => '/themes/cafe-demo/items/espresso.webp',
                'cover_image_url' => '/themes/cafe-demo/items/espresso.webp',
                'price_minor' => $priceToman * 10,
                'currency' => 'IRR',
                'stock' => 100,
                'manage_stock' => false,
                'stock_status' => 'instock',
                'is_available' => true,
                'is_hidden' => false,
                'is_sold_out' => false,
                'is_featured' => in_array($catSlug, ['hot-coffee', 'burgers', 'pizza'], true) && $order < 8,
                'sort_order' => $order++,
                'status' => 'publish',
                'type' => 'simple',
                'catalog_visibility' => 'visible',
                'meta' => ['seed' => $TAG, 'source' => $item['source'] ?? 'ezy'],
            ],
        );
    }

    $settings->put($tid, 'cafe', 'venue', array_merge(
        $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
        [
            'tagline_fa' => 'سالن غربی، قهوه تخصصی و رستوران در واوان',
            'tagline_en' => 'Western saloon cafe & restaurant in Vavan',
            'about_fa' => "کافه رستوران لیمبو در شهرک واوان اسلامشهر؛ فضای سالن غربی، قهوه‌های تخصصی، برگر دست‌ساز و پیتزا.\nآدرس: اسلامشهر، واوان، بلوار ولیعصر، خیابان علامه شهیدی\nتلفن: ۰۲۱۵۶۲۸۸۶۷۷",
            'about_en' => 'Limbo Cafe & Restaurant — western saloon vibe in Vavan, Eslamshahr.',
            'phone' => '02156288677',
            'instagram' => 'limbocaferestaurant',
            'address_fa' => 'اسلامشهر، واوان، بلوار ولیعصر، خیابان علامه شهیدی',
            'address_en' => 'Vavan, Valiasr Blvd, Allameh Shahidi St, Eslamshahr',
            'map_url' => 'https://neshan.org/maps/places/c75f44a72f41e22aab4e42afafdc80e7',
            'mini_site_enabled' => true,
        ],
    ));

    $days = [];
    foreach (['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as $day) {
        $days[] = ['day' => $day, 'open' => '14:00', 'close' => '23:45', 'closed' => false];
    }
    $settings->put($tid, 'cafe', 'hours', ['timezone' => 'Asia/Tehran', 'days' => $days, 'closed_dates' => []]);
    $settings->put($tid, 'cafe', 'menu', array_merge(
        $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
        [
            'accent_color' => PALETTE['primary'],
            'header_cta_label_fa' => 'رزرو میز',
            'header_cta_url' => '/reservations',
            'placeholder_logo_text_fa' => 'LIMBO',
        ],
    ));

    $tenant->name = 'کافه رستوران لیمبو';
    $tenant->store_display_name = 'LIMBO';
    $tenant->active_theme_slug = 'cafe-signature';
    $tenant->site_type_slug = 'cafe';
    $branding = ThemeCatalog::normalizeBranding($tenant->branding);
    $branding['accent'] = 'custom';
    $branding['logo_url'] = '/brand/limbocafe/logo.png';
    $branding['logo_dark_url'] = '/brand/limbocafe/logo.png';
    $branding['favicon_url'] = '/brand/limbocafe/logo.png';
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

    echo "Limbo import: {$order} items, ".count($catIds)." categories (ezy cafe=".($payload['counts']['cafe'] ?? '?')." rest=".($payload['counts']['restaurant'] ?? '?').")\n";
});

foreach (['venue', 'menu', 'hours', 'gallery', 'engagement'] as $sub) {
    Cache::forget("module_settings:{$tid}:cafe.{$sub}");
}
Cache::forget('modules:tenant:'.$tid);
Cache::forget('kernel:tenant:'.$tid.':activations');
