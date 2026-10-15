<?php

/**
 * One-shot Blue Cafe menu + brand colors for a running tenant.
 * Usage (inside backend container): php scripts/seed-bluecafe-menu.php
 */

use App\Kernel\ThemeCatalog;
use App\Models\Allergen;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Product;
use App\Models\ProductModifier;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();

const IMG = '/themes/cafe-demo';
const DEMO_TAG = 'bluecafe-menu';
const ACCENT = '#1b6bc4';

$tenant = Tenant::query()->first();
if (! $tenant) {
    fwrite(STDERR, "No tenant found.\n");
    exit(1);
}

$tid = (int) $tenant->id;
$settings = $app->make(ModuleSettingsService::class);

$categoryDefs = [
    'hot-drinks' => ['نوشیدنی گرم', 'hot', 'cafe'],
    'cold-drinks' => ['نوشیدنی سرد', 'cold', 'cold-bar'],
    'tea-herbal' => ['چای و دمنوش', 'tea', 'cafe'],
    'mocktails-juices' => ['ماکتل و آبمیوه', 'cold', 'cold-bar'],
    'shakes' => ['شیک', 'cold', 'cold-bar'],
];

$items = [
    // نوشیدنی گرم
    ['slug' => 'bc-espresso-single', 'cat' => 'hot-drinks', 'name' => 'اسپرسو تک', 'en' => 'Single espresso', 'price' => 85000, 'desc' => 'یک شات اسپرسوی تازه با کرمای غلیظ.', 'img' => 'espresso', 'mods' => 'espresso', 'tags' => ['featured']],
    ['slug' => 'bc-espresso-double', 'cat' => 'hot-drinks', 'name' => 'اسپرسو دوبل', 'en' => 'Double espresso', 'price' => 110000, 'desc' => 'دو شات اسپرسو برای طعم قوی‌تر.', 'img' => 'espresso', 'mods' => 'espresso'],
    ['slug' => 'bc-dragon-shot', 'cat' => 'hot-drinks', 'name' => 'دراگون شات', 'en' => 'Dragon shot', 'price' => 145000, 'desc' => 'شات مخصوص بلو کافه با نت ادویه‌ای و تلخی ملایم.', 'img' => 'espresso', 'tags' => ['new', 'featured']],
    ['slug' => 'bc-latte', 'cat' => 'hot-drinks', 'name' => 'لاته', 'en' => 'Latte', 'price' => 135000, 'desc' => 'لاته کلاسیک؛ طعم‌ها: فندقی، وانیل، شکلات.', 'img' => 'latte', 'mods' => 'latte-flavors', 'allergens' => ['dairy']],
    ['slug' => 'bc-cappuccino-classic', 'cat' => 'hot-drinks', 'name' => 'کاپوچینو کلاسیک', 'en' => 'Classic cappuccino', 'price' => 125000, 'desc' => 'نسبت کلاسیک اسپرسو، شیر و فوم مخملی.', 'img' => 'cappuccino', 'mods' => 'latte', 'allergens' => ['dairy'], 'tags' => ['featured']],
    ['slug' => 'bc-hot-chocolate', 'cat' => 'hot-drinks', 'name' => 'هات چاکلت', 'en' => 'Hot chocolate', 'price' => 140000, 'desc' => 'شکلات داغ خامه‌ای با کاکائوی تلخ.', 'img' => 'mocha-frappe', 'allergens' => ['dairy']],
    ['slug' => 'bc-affogato-vanilla', 'cat' => 'hot-drinks', 'name' => 'آفوگاتو وانیل', 'en' => 'Vanilla affogato', 'price' => 160000, 'desc' => 'بستنی وانیل غرق در اسپرسوی داغ.', 'img' => 'affogato', 'allergens' => ['dairy']],
    ['slug' => 'bc-americano', 'cat' => 'hot-drinks', 'name' => 'آمریکانو', 'en' => 'Americano', 'price' => 95000, 'desc' => 'اسپرسو روی آب داغ؛ سبک و خوش‌عطر.', 'img' => 'americano', 'mods' => 'coffee'],
    ['slug' => 'bc-mocha-chocolate', 'cat' => 'hot-drinks', 'name' => 'موکا شکلات', 'en' => 'Chocolate mocha', 'price' => 155000, 'desc' => 'اسپرسو، شکلات و شیر بخارداده.', 'img' => 'caramel-macchiato', 'mods' => 'latte', 'allergens' => ['dairy']],
    ['slug' => 'bc-turkish-coffee', 'cat' => 'hot-drinks', 'name' => 'قهوه ترک', 'en' => 'Turkish coffee', 'price' => 95000, 'desc' => 'قهوه ترک سنتی، دم‌شده روی حرارت ملایم.', 'img' => 'turkish-coffee'],
    ['slug' => 'bc-brewed-coffee', 'cat' => 'hot-drinks', 'name' => 'قهوه دمی', 'en' => 'Brewed coffee', 'price' => 105000, 'desc' => 'قهوه فیلتری تازه دم.', 'img' => 'americano'],
    ['slug' => 'bc-nescafe-classic', 'cat' => 'hot-drinks', 'name' => 'نسکافه کلاسیک', 'en' => 'Classic Nescafé', 'price' => 90000, 'desc' => 'نسکافه کلاسیک داغ.', 'img' => 'latte', 'allergens' => ['dairy']],

    // نوشیدنی سرد
    ['slug' => 'bc-iced-americano', 'cat' => 'cold-drinks', 'name' => 'آیس آمریکانو', 'en' => 'Iced americano', 'price' => 105000, 'desc' => 'اسپرسو روی یخ و آب سرد.', 'img' => 'iced-americano', 'mods' => 'cold'],
    ['slug' => 'bc-iced-latte', 'cat' => 'cold-drinks', 'name' => 'آیس لاته', 'en' => 'Iced latte', 'price' => 145000, 'desc' => 'لاته سرد با شیر و یخ.', 'img' => 'iced-latte', 'mods' => 'cold', 'allergens' => ['dairy'], 'tags' => ['featured']],
    ['slug' => 'bc-iced-caramel-macchiato', 'cat' => 'cold-drinks', 'name' => 'آیس کارامل ماکیاتو', 'en' => 'Iced caramel macchiato', 'price' => 165000, 'desc' => 'شیر سرد، اسپرسو و کارامل روی یخ.', 'img' => 'iced-caramel-macchiato', 'mods' => 'cold', 'allergens' => ['dairy']],
    ['slug' => 'bc-espresso-tonic', 'cat' => 'cold-drinks', 'name' => 'اسپرسو تونیک', 'en' => 'Espresso tonic', 'price' => 155000, 'desc' => 'اسپرسو روی آب‌تونیک و یخ.', 'img' => 'cold-brew', 'tags' => ['new']],
    ['slug' => 'bc-espresso-lemonade', 'cat' => 'cold-drinks', 'name' => 'اسپرسو لیموناد', 'en' => 'Espresso lemonade', 'price' => 155000, 'desc' => 'ترکیب اسپرسو و لیموناد تازه.', 'img' => 'iced-tea'],
    ['slug' => 'bc-biscuit-latte', 'cat' => 'cold-drinks', 'name' => 'بیسکویت لاته', 'en' => 'Biscuit latte', 'price' => 175000, 'desc' => 'لاته سرد با طعم بیسکویت.', 'img' => 'iced-latte', 'allergens' => ['dairy', 'gluten']],
    ['slug' => 'bc-orthocoffee-classic', 'cat' => 'cold-drinks', 'name' => 'اورتوکافی کلاسیک', 'en' => 'Orthocoffee classic', 'price' => 185000, 'desc' => 'نوشیدنی سرد مخصوص بلو کافه.', 'img' => 'cold-brew', 'tags' => ['featured']],
    ['slug' => 'bc-orange-caffeine', 'cat' => 'cold-drinks', 'name' => 'پرتقال کافئین', 'en' => 'Orange caffeine', 'price' => 170000, 'desc' => 'آب پرتقال تازه با شات اسپرسو.', 'img' => 'iced-americano'],
    ['slug' => 'bc-pineapple-caffeine', 'cat' => 'cold-drinks', 'name' => 'آناناس کافئین', 'en' => 'Pineapple caffeine', 'price' => 170000, 'desc' => 'آب آناناس با شات اسپرسو.', 'img' => 'iced-americano'],

    // چای و دمنوش
    ['slug' => 'bc-black-tea', 'cat' => 'tea-herbal', 'name' => 'چای سیاه', 'en' => 'Black tea', 'price' => 65000, 'desc' => 'چای سیاه دم‌کشیده.', 'img' => 'green-tea', 'mods' => 'tea'],
    ['slug' => 'bc-masala-tea', 'cat' => 'tea-herbal', 'name' => 'چای ماسالا', 'en' => 'Masala tea', 'price' => 125000, 'desc' => 'چای سیاه با دارچین، زنجبیل و هل.', 'img' => 'masala-chai', 'allergens' => ['dairy'], 'spice' => 1, 'tags' => ['featured']],
    ['slug' => 'bc-chamomile', 'cat' => 'tea-herbal', 'name' => 'دمنوش بابونه', 'en' => 'Chamomile tea', 'price' => 90000, 'desc' => 'دمنوش آرام‌بخش بابونه.', 'img' => 'lemon-verbena', 'mods' => 'tea'],
    ['slug' => 'bc-borage', 'cat' => 'tea-herbal', 'name' => 'دمنوش گل گاوزبان', 'en' => 'Borage tea', 'price' => 95000, 'desc' => 'دمنوش سنتی گل گاوزبان.', 'img' => 'lemon-verbena', 'mods' => 'tea'],
    ['slug' => 'bc-lavender', 'cat' => 'tea-herbal', 'name' => 'دمنوش اسطوخودوس', 'en' => 'Lavender tea', 'price' => 95000, 'desc' => 'دمنوش معطر اسطوخودوس.', 'img' => 'green-tea', 'mods' => 'tea'],
    ['slug' => 'bc-orange-blossom', 'cat' => 'tea-herbal', 'name' => 'بهار نارنج', 'en' => 'Orange blossom', 'price' => 90000, 'desc' => 'دمنوش بهارنارنج.', 'img' => 'lemon-verbena', 'mods' => 'tea'],
    ['slug' => 'bc-green-tea', 'cat' => 'tea-herbal', 'name' => 'چای سبز', 'en' => 'Green tea', 'price' => 85000, 'desc' => 'چای سبز سبک و تازه.', 'img' => 'green-tea', 'mods' => 'tea'],

    // ماکتل و آبمیوه
    ['slug' => 'bc-pina-colada', 'cat' => 'mocktails-juices', 'name' => 'پیناکولاد', 'en' => 'Piña colada', 'price' => 195000, 'desc' => 'کرم نارگیل، آب آناناس، شیر نارگیل و یخ.', 'img' => 'iced-tea', 'tags' => ['featured']],
    ['slug' => 'bc-mojito-classic', 'cat' => 'mocktails-juices', 'name' => 'موهیتو کلاسیک', 'en' => 'Classic mojito', 'price' => 175000, 'desc' => 'برگ نعناع، شکر، لیمو، سودا و یخ.', 'img' => 'iced-tea', 'tags' => ['featured']],
    ['slug' => 'bc-mojito-fruit', 'cat' => 'mocktails-juices', 'name' => 'موهیتو میوه‌ای', 'en' => 'Fruit mojito', 'price' => 185000, 'desc' => 'هلو، آناناس و انبه با پایه موهیتو.', 'img' => 'iced-tea'],
    ['slug' => 'bc-strawberry-lemonade', 'cat' => 'mocktails-juices', 'name' => 'لیموناد توت‌فرنگی', 'en' => 'Strawberry lemonade', 'price' => 165000, 'desc' => 'توت‌فرنگی تازه، لیمو، سودا و یخ.', 'img' => 'iced-tea'],
    ['slug' => 'bc-tropical-passage', 'cat' => 'mocktails-juices', 'name' => 'گذرگاه استوایی', 'en' => 'Tropical passage', 'price' => 185000, 'desc' => 'آب آناناس، پرتقال، لیمو و سیروپ انگور.', 'img' => 'iced-tea', 'tags' => ['new']],
    ['slug' => 'bc-strawberry-sunrise', 'cat' => 'mocktails-juices', 'name' => 'سانرایز توت‌فرنگی', 'en' => 'Strawberry sunrise', 'price' => 195000, 'desc' => 'توت‌فرنگی، بستنی وانیل، شیر، عسل و یخ.', 'img' => 'mocha-frappe', 'allergens' => ['dairy']],
    ['slug' => 'bc-orange-juice', 'cat' => 'mocktails-juices', 'name' => 'آب پرتقال', 'en' => 'Orange juice', 'price' => 120000, 'desc' => 'آب پرتقال تازه.', 'img' => 'iced-americano'],
    ['slug' => 'bc-pineapple-juice', 'cat' => 'mocktails-juices', 'name' => 'آب آناناس', 'en' => 'Pineapple juice', 'price' => 120000, 'desc' => 'آب آناناس طبیعی.', 'img' => 'iced-tea'],
    ['slug' => 'bc-pomegranate-juice', 'cat' => 'mocktails-juices', 'name' => 'آب انار', 'en' => 'Pomegranate juice', 'price' => 140000, 'desc' => 'آب انار تازه.', 'img' => 'iced-caramel-macchiato'],
    ['slug' => 'bc-mango-juice', 'cat' => 'mocktails-juices', 'name' => 'آب انبه', 'en' => 'Mango juice', 'price' => 140000, 'desc' => 'آب انبه طبیعی.', 'img' => 'iced-latte'],

    // شیک
    ['slug' => 'bc-shake-caffeine-cranberry', 'cat' => 'shakes', 'name' => 'شیک کافئین کرن‌بری', 'en' => 'Caffeine cranberry shake', 'price' => 195000, 'desc' => 'شیک کرن‌بری با شات اسپرسو.', 'img' => 'mocha-frappe', 'allergens' => ['dairy'], 'tags' => ['featured']],
    ['slug' => 'bc-shake-caffeine-chocolate', 'cat' => 'shakes', 'name' => 'شیک کافئین شکلات', 'en' => 'Caffeine chocolate shake', 'price' => 195000, 'desc' => 'شیک شکلات با شات اسپرسو.', 'img' => 'mocha-frappe', 'allergens' => ['dairy']],
    ['slug' => 'bc-shake-nutella', 'cat' => 'shakes', 'name' => 'شیک نوتلا', 'en' => 'Nutella shake', 'price' => 210000, 'desc' => 'شیک خامه‌ای با نوتلا.', 'img' => 'mocha-frappe', 'allergens' => ['dairy', 'nuts']],
    ['slug' => 'bc-shake-strawberry', 'cat' => 'shakes', 'name' => 'شیک توت‌فرنگی', 'en' => 'Strawberry shake', 'price' => 180000, 'desc' => 'شیک توت‌فرنگی تازه.', 'img' => 'panna-cotta', 'allergens' => ['dairy']],
    ['slug' => 'bc-shake-lotus', 'cat' => 'shakes', 'name' => 'شیک لوتوس کلاسیک', 'en' => 'Classic Lotus shake', 'price' => 210000, 'desc' => 'شیک بیسکویت لوتوس.', 'img' => 'brownie', 'allergens' => ['dairy', 'gluten'], 'tags' => ['featured']],
    ['slug' => 'bc-shake-banana', 'cat' => 'shakes', 'name' => 'شیک موز', 'en' => 'Banana shake', 'price' => 170000, 'desc' => 'شیک موز کلاسیک.', 'img' => 'pancake', 'allergens' => ['dairy']],
    ['slug' => 'bc-shake-strawberry-cream', 'cat' => 'shakes', 'name' => 'شیک توت‌فرنگی خامه', 'en' => 'Strawberry cream shake', 'price' => 195000, 'desc' => 'توت‌فرنگی با خامه زده.', 'img' => 'panna-cotta', 'allergens' => ['dairy']],
    ['slug' => 'bc-shake-dark-chocolate', 'cat' => 'shakes', 'name' => 'شیک شکلات دارک', 'en' => 'Dark chocolate shake', 'price' => 195000, 'desc' => 'شیک شکلات تلخ غلیظ.', 'img' => 'chocolate-cake', 'allergens' => ['dairy']],
    ['slug' => 'bc-shake-majoon', 'cat' => 'shakes', 'name' => 'شیک معجون', 'en' => 'Majoon shake', 'price' => 220000, 'desc' => 'شیک معجون با مغز و عسل.', 'img' => 'brownie', 'allergens' => ['dairy', 'nuts']],
    ['slug' => 'bc-shake-peanut', 'cat' => 'shakes', 'name' => 'شیک بادام‌زمینی', 'en' => 'Peanut shake', 'price' => 200000, 'desc' => 'شیک کره بادام‌زمینی.', 'img' => 'brownie', 'allergens' => ['dairy', 'nuts']],
];

function modifierSet(?string $set): array
{
    $size = ['fa' => 'سایز', 'en' => 'Size', 'min' => 1, 'max' => 1, 'options' => [
        ['کوچک', 'Small', 0, true],
        ['متوسط', 'Medium', 15000, false],
        ['بزرگ', 'Large', 28000, false],
    ]];
    $milk = ['fa' => 'شیر گیاهی', 'en' => 'Plant milk', 'min' => 0, 'max' => 1, 'options' => [
        ['شیر بادام', 'Almond milk', 22000, false],
        ['شیر جو دوسر', 'Oat milk', 22000, false],
        ['شیر نارگیل', 'Coconut milk', 25000, false],
    ]];
    $shot = ['fa' => 'شات اضافه', 'en' => 'Extra shot', 'min' => 0, 'max' => 1, 'options' => [
        ['یک شات', 'One shot', 25000, false],
        ['دو شات', 'Two shots', 45000, false],
    ]];
    $syrup = ['fa' => 'طعم لاته', 'en' => 'Latte flavor', 'min' => 0, 'max' => 1, 'options' => [
        ['فندقی', 'Hazelnut', 15000, false],
        ['وانیل', 'Vanilla', 15000, false],
        ['شکلات', 'Chocolate', 15000, false],
    ]];

    return match ($set) {
        'espresso' => [$shot],
        'coffee' => [$size, $milk, $shot],
        'latte' => [$size, $milk, $shot],
        'latte-flavors' => [$size, $milk, $shot, $syrup],
        'cold' => [$size, $milk, $shot],
        'tea' => [
            ['fa' => 'سرو', 'en' => 'Serving', 'min' => 1, 'max' => 1, 'options' => [
                ['فنجانی', 'Cup', 0, true],
                ['قوری دو نفره', 'Pot for two', 65000, false],
            ]],
        ],
        default => [],
    };
}

DB::transaction(function () use ($tid, $settings, $tenant, $categoryDefs, $items) {
    // Replace the whole catalogue with the printed Blue Cafe menu.
    Product::query()->where('tenant_id', $tid)->delete();
    Category::query()->where('tenant_id', $tid)->delete();

    $menu = array_merge(
        $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
        [
            'default_view' => 'grid',
            'show_search' => true,
            'show_category_bar' => true,
            'show_new_badge' => true,
            'header_cta_label_fa' => 'رزرو میز',
            'header_cta_label_en' => 'Book a table',
            'header_cta_url' => '/reservations',
            'placeholder_logo_text_fa' => 'Blue',
            'placeholder_logo_text_en' => 'Blue',
            'accent_color' => ACCENT,
            'seasonal_theme' => 'none',
            'font_preset' => 'sans',
            'packaging_fee_minor' => 0,
            'delivery_fee_minor' => 450000,
            'free_delivery_threshold_minor' => 8000000,
            'prep_minutes' => 12,
            'fulfillment_dine_in' => true,
            'fulfillment_pickup' => true,
            'fulfillment_delivery' => true,
        ],
    );
    $settings->put($tid, 'cafe', 'menu', $menu);

    $days = [];
    foreach (['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as $day) {
        $days[] = [
            'day' => $day,
            'open' => '09:00',
            // Inclusive through 23:59 — "تا ۱۱ شب" means the whole 11pm hour, not a hard cut at 23:00:00.
            'close' => '23:59',
            'closed' => false,
        ];
    }
    $settings->put($tid, 'cafe', 'hours', [
        'timezone' => 'Asia/Tehran',
        'days' => $days,
        'closed_dates' => [],
    ]);

    $settings->put($tid, 'cafe', 'venue', array_merge(
        $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
        [
            // From Instagram @cafebluedez (Cafe blue|کافه آبی)
            'tagline_fa' => 'یک روز با آرامش برای شما',
            'tagline_en' => 'A calm day for you',
            // Hours live only in the hours settings (shown on the about page); no copy to drift.
            'about_fa' => "کافه آبی (@cafebluedez)\nیک روز با آرامش برای شما.\nآدرس: بلوار شریعتی، کوچه ساسان، جنب پاساژ امین.",
            'about_en' => "Cafe Blue (@cafebluedez)\nA calm day for you.\nAddress: Shariati Blvd, Sasan Alley, next to Amin Passage.",
            // No placeholder number; the owner sets the real one in the dashboard.
            'phone' => null,
            'instagram' => '@cafebluedez',
            'address_fa' => 'بلوار شریعتی، کوچه ساسان، جنب پاساژ امین',
            'address_en' => 'Shariati Blvd, Sasan Alley, next to Amin Passage',
            'map_url' => 'https://www.google.com/maps/search/?api=1&query='.rawurlencode('بلوار شریعتی کوچه ساسان پاساژ امین'),
            'mini_site_enabled' => true,
        ],
    ));

    $allergenDefs = [
        'dairy' => ['لبنیات', 'Dairy'],
        'gluten' => ['گلوتن', 'Gluten'],
        'egg' => ['تخم‌مرغ', 'Egg'],
        'nuts' => ['مغزها', 'Nuts'],
    ];
    $allergens = [];
    $i = 0;
    foreach ($allergenDefs as $slug => [$fa, $en]) {
        $allergens[$slug] = (int) Allergen::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            ['name_fa' => $fa, 'name_en' => $en, 'sort_order' => $i++],
        )->id;
    }

    $menuDefs = [
        'cafe' => ['کافه', 'cafe', 'نوشیدنی‌های گرم و دمنوش'],
        'cold-bar' => ['بار سرد', 'bar', 'سرد، ماکتل، آبمیوه و شیک'],
    ];
    $menus = [];
    $i = 0;
    foreach ($menuDefs as $slug => [$name, $type, $desc]) {
        $menus[$slug] = (int) Menu::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            ['name' => $name, 'menu_type' => $type, 'locale' => 'fa', 'is_active' => true, 'sort_order' => $i++, 'description' => $desc],
        )->id;
    }

    $categories = [];
    $i = 0;
    foreach ($categoryDefs as $slug => [$name, $image, $menuSlug]) {
        $categories[$slug] = (int) Category::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $slug],
            [
                'name' => $name,
                'image_url' => IMG."/cat/{$image}.webp",
                'cover_image_url' => IMG."/cat/{$image}.webp",
                'display_mode' => 'grid',
                'sort_order' => $i++,
                'status' => 'publish',
                'meta' => ['seed' => DEMO_TAG],
            ],
        )->id;
    }

    // Older runs seeded near-duplicates (کاپوچینو vs کاپوچینو کلاسیک, ماسالا vs چای ماسالا). Hide them
    // instead of deleting so past orders keep their product rows.
    Product::query()->where('tenant_id', $tid)->whereIn('slug', ['bc-cappuccino', 'bc-masala'])
        ->update(['is_hidden' => true, 'status' => 'draft']);

    $order = 0;
    foreach ($items as $item) {
        $menuSlug = $categoryDefs[$item['cat']][2];
        $img = IMG.'/items/'.($item['img'] ?? $item['slug']).'.webp';
        $product = Product::query()->updateOrCreate(
            ['tenant_id' => $tid, 'slug' => $item['slug']],
            [
                'category_id' => $categories[$item['cat']],
                'menu_id' => $menus[$menuSlug],
                'name' => $item['name'],
                'english_name' => $item['en'],
                'description' => $item['desc'],
                'short_description' => $item['desc'],
                'image_url' => $img,
                'cover_image_url' => $img,
                'price_minor' => $item['price'] * 10,
                'sale_price_minor' => isset($item['sale']) ? $item['sale'] * 10 : null,
                'currency' => 'IRR',
                'stock' => 50,
                'manage_stock' => false,
                'stock_status' => 'instock',
                'is_available' => true,
                'is_hidden' => false,
                'is_sold_out' => false,
                'is_new' => in_array('new', $item['tags'] ?? [], true),
                'is_featured' => in_array('featured', $item['tags'] ?? [], true),
                'calories' => $item['kcal'] ?? null,
                'spice_level' => $item['spice'] ?? 0,
                'sort_order' => $order++,
                'status' => 'publish',
                'type' => 'simple',
                'catalog_visibility' => 'visible',
                'meta' => ['seed' => DEMO_TAG],
            ],
        );

        $product->allergens()->sync(array_values(array_intersect_key($allergens, array_flip($item['allergens'] ?? []))));
        ProductModifier::query()->where('product_id', $product->id)->delete();
        foreach (modifierSet($item['mods'] ?? null) as $index => $group) {
            $modifier = ProductModifier::query()->create([
                'tenant_id' => $tid,
                'product_id' => $product->id,
                'name_fa' => $group['fa'],
                'name_en' => $group['en'],
                'min_select' => $group['min'],
                'max_select' => $group['max'],
                'is_required' => $group['min'] > 0,
                'sort_order' => $index,
            ]);
            foreach ($group['options'] as $o => [$fa, $en, $toman, $default]) {
                $modifier->options()->create([
                    'name_fa' => $fa,
                    'name_en' => $en,
                    'price_minor' => $toman * 10,
                    'is_default' => $default,
                    'sort_order' => $o,
                ]);
            }
        }
    }

    $tenant->name = 'کافه آبی';
    $tenant->store_display_name = 'کافه آبی';
    $tenant->active_theme_slug = 'cafe-signature';
    $tenant->site_type_slug = 'cafe';
    $branding = ThemeCatalog::normalizeBranding($tenant->branding);
    $branding['accent'] = 'blue';
    // Same-origin brand assets: an absolute URL on another host (bluecafe.webinaagency.ir) breaks
    // when the cafe is served on its own domain and costs an extra TLS handshake.
    $sameOrigin = fn (?string $u, string $fallback) => ($u === null || $u === '' || preg_match('#^https?://#i', $u)) ? $fallback : $u;
    $branding['logo_url'] = $sameOrigin($branding['logo_url'] ?? null, '/brand/bluecafe/logo.png');
    $branding['logo_dark_url'] = $sameOrigin($branding['logo_dark_url'] ?? null, '/brand/bluecafe/logo.png');
    $branding['favicon_url'] = $sameOrigin($branding['favicon_url'] ?? null, '/brand/bluecafe/favicon.png');
    $branding['palette'] = array_merge($branding['palette'] ?? [], [
        'primary' => ACCENT,
        'secondary' => '#0d3d7a',
        'accent' => '#5ba8e8',
        'bg' => '#eef4fb',
        'surface' => '#ffffff',
        'text' => '#0d2b4a',
        'muted' => '#5a7390',
        'text3' => '#8aa0b8',
        'navy' => '#0d3d7a',
        'header' => '#0d3d7a',
        'footer' => '#0d3d7a',
        'border' => '#d7e6f7',
    ]);
    $tenant->branding = ThemeCatalog::mergeIntoExisting($tenant->branding, $branding);
    $tenant->save();

    // One palette: the storefront appearance colours (shop chrome, cart, checkout) follow the cafe
    // palette instead of the pink/navy store defaults. save() also syncs them back to branding.palette.
    app(\App\Services\Shop\StorefrontAppearanceService::class)->save($tid, [
        'primary_color' => ACCENT,
        'secondary_color' => '#0d3d7a',
        'accent_color' => '#5ba8e8',
        'text1_color' => '#0d2b4a',
        'text2_color' => '#5a7390',
        'text3_color' => '#8aa0b8',
        'navy_color' => '#0d3d7a',
        'surface_color' => '#ffffff',
        'header_bg' => '#0d3d7a',
        'footer_bg' => '#0d3d7a',
        'border_color' => '#d7e6f7',
    ]);

    echo "Seeded {$order} Blue Cafe items in ".count($categories)." categories. accent=".ACCENT."\n";
});

foreach (['venue', 'menu', 'hours', 'gallery', 'engagement'] as $sub) {
    Cache::forget("module_settings:{$tid}:cafe.{$sub}");
}
Cache::forget('modules:tenant:'.$tid);
Cache::forget('kernel:tenant:'.$tid.':activations');

echo "Done. Open /catalogue\n";
