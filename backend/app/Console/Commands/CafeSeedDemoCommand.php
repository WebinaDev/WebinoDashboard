<?php

namespace App\Console\Commands;

use App\Kernel\TenantActivationService;
use App\Kernel\ThemeCatalog;
use App\Models\Allergen;
use App\Models\CafeBranch;
use App\Models\CafeEvent;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuBanner;
use App\Models\Product;
use App\Models\ProductModifier;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Loads a complete Persian demo cafe (venue, hours, gallery, menus, categories, ~36 items with photos, modifiers,
 * allergens, banners, branches, events) into the single tenant so every cafe skin can be shown to prospects.
 * Idempotent: rows are matched by slug and refreshed on every run. Photos ship with the frontend under
 * /themes/cafe-demo (Unsplash license).
 */
class CafeSeedDemoCommand extends Command
{
    protected $signature = 'cafe:seed-demo
        {--theme=cafe-signature : Cafe theme to activate (cafe-signature, cafe-reyhoon, cafe-mash-donald, cafe-kerase, cafe-super, cafe-menew)}
        {--brand= : Rename the tenant, e.g. --brand="کافه دَم"}
        {--fresh : Remove previously seeded demo rows before seeding}
        {--switch-site-type : Switch the tenant to the cafe site type when it is something else}
        {--keep-theme : Seed data only, do not change the active theme}';

    protected $description = 'Seed a sales-ready Persian demo cafe menu (images, modifiers, hours, gallery) and activate a cafe theme';

    private const IMG = '/themes/cafe-demo';

    private const DEMO_TAG = 'cafe-demo';

    public function handle(ModuleSettingsService $settings, TenantActivationService $activation): int
    {
        $tenant = Tenant::query()->first();
        if (! $tenant) {
            $this->error('No tenant found. Run the installer / provisioning first.');

            return self::FAILURE;
        }

        $theme = (string) $this->option('theme');
        if (ThemeCatalog::find($theme) === null || ! str_starts_with($theme, 'cafe-')) {
            $this->error("Unknown cafe theme: {$theme}");

            return self::FAILURE;
        }

        $siteType = $tenant->site_type_slug ?? $tenant->business_type_slug;
        if ($siteType !== 'cafe') {
            if ($this->option('switch-site-type')) {
                $activation->applySiteType($tenant, 'cafe');
                $tenant->refresh();
                $this->info('Site type switched to cafe.');
            } else {
                $this->warn("Tenant site type is '".($siteType ?: 'none')."'. Cafe themes and menu pages need the cafe site type; rerun with --switch-site-type to apply it.");
            }
        }

        $tid = (int) $tenant->id;
        $brand = filled($this->option('brand')) ? trim((string) $this->option('brand')) : (string) $tenant->name;

        DB::transaction(function () use ($tid, $settings, $brand) {
            if ($this->option('fresh')) {
                $this->purge($tid);
            }

            $this->seedSettings($tid, $settings, $brand);
            $allergens = $this->seedAllergens($tid);
            $menus = $this->seedMenus($tid);
            $categories = $this->seedCategories($tid);
            $count = $this->seedProducts($tid, $menus, $categories, $allergens);
            $this->seedBanners($tid, $menus);
            $this->seedBranches($tid);
            $this->seedEvents($tid);

            $this->info("Seeded {$count} menu items in ".count($categories).' categories.');
        });

        if (filled($this->option('brand'))) {
            $tenant->name = (string) $this->option('brand');
        }
        if (! $this->option('keep-theme')) {
            $tenant->active_theme_slug = $theme;
        }
        $tenant->save();

        foreach (['venue', 'menu', 'hours', 'gallery', 'engagement'] as $sub) {
            Cache::forget("module_settings:{$tid}:cafe.{$sub}");
        }
        Cache::forget('modules:tenant:'.$tid);
        Cache::forget('kernel:tenant:'.$tid.':activations');

        $this->info('Demo cafe ready'.($this->option('keep-theme') ? '.' : " with theme {$theme}.").' Open /catalogue (add ?table=7 to try table ordering).');

        return self::SUCCESS;
    }

    private function purge(int $tid): void
    {
        $slugs = array_column($this->items(), 'slug');
        Product::query()->where('tenant_id', $tid)->whereIn('slug', $slugs)->delete();
        Category::query()->where('tenant_id', $tid)->whereIn('slug', array_keys($this->categoryDefs()))->delete();
        MenuBanner::query()->where('tenant_id', $tid)->where('image_url', 'like', self::IMG.'/%')->delete();
        CafeEvent::query()->where('tenant_id', $tid)->whereIn('title_en', ['Live acoustic night', 'Latte art workshop'])->delete();
        $this->line('Removed previous demo rows.');
    }

    private function seedSettings(int $tid, ModuleSettingsService $settings, string $brand): void
    {
        $mark = trim((string) preg_replace('/^(کافه|cafe)\s+/iu', '', $brand)) ?: $brand;

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
                'placeholder_logo_text_fa' => mb_substr($mark, 0, 12),
                'placeholder_logo_text_en' => null,
                // Keep the settings default so each skin shows its own palette.
                'accent_color' => '#c46b3a',
                'seasonal_theme' => 'none',
                'font_preset' => 'sans',
                'packaging_fee_minor' => 0,
                'delivery_fee_minor' => 450000,
                'free_delivery_threshold_minor' => 8000000,
                'prep_minutes' => 15,
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
                'open' => $day === 'friday' ? '10:00' : '08:00',
                'close' => in_array($day, ['wednesday', 'thursday'], true) ? '23:59' : '23:30',
                'closed' => false,
            ];
        }
        $settings->put($tid, 'cafe', 'hours', [
            'timezone' => 'Asia/Tehran',
            'days' => $days,
            'closed_dates' => [],
        ]);

        $settings->put($tid, 'cafe', 'gallery', [
            'images' => [
                ['url' => self::IMG.'/gallery/interior-1.webp', 'caption_fa' => 'سالن اصلی با نور گرم عصر', 'caption_en' => 'Main hall in the warm evening light', 'sort_order' => 0],
                ['url' => self::IMG.'/gallery/brew-bar.webp', 'caption_fa' => 'بار دم‌آوری: V60، کمکس و سایفون', 'caption_en' => 'Brew bar: V60, Chemex and siphon', 'sort_order' => 1],
                ['url' => self::IMG.'/gallery/window.webp', 'caption_fa' => 'میزهای کنار پنجره', 'caption_en' => 'Window tables', 'sort_order' => 2],
                ['url' => self::IMG.'/gallery/garden.webp', 'caption_fa' => 'حیاط سبز، مخصوص عصرهای تابستان', 'caption_en' => 'Garden courtyard for summer evenings', 'sort_order' => 3],
                ['url' => self::IMG.'/gallery/cups.webp', 'caption_fa' => 'هر فنجان، یک دم تازه', 'caption_en' => 'Every cup freshly brewed', 'sort_order' => 4],
                ['url' => self::IMG.'/hero/bar.webp', 'caption_fa' => 'پیشخوان و دستگاه اسپرسو', 'caption_en' => 'Espresso bar', 'sort_order' => 5],
            ],
        ]);

        $settings->put($tid, 'cafe', 'venue', array_merge(
            $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
            [
                'tagline_fa' => 'قهوه‌ی تخصصی، صبحانه‌ی تازه و یک دم آرامش وسط شهر',
                'tagline_en' => 'Specialty coffee, fresh breakfast and a calm breath in the city',
                'about_fa' => "{$brand} از سال ۱۳۹۸ با یک دستگاه اسپرسو و عشق به قهوه‌ی تازه شروع شد.\nدانه‌ها را هر هفته خودمان رست می‌کنیم، نان و کیک‌ها هر صبح در آشپزخانه‌ی کافه پخته می‌شوند و منو با فصل عوض می‌شود.\nبرای قرار کاری، کتاب‌خواندن یا یک برانچ آخر هفته، جای شما کنار پنجره محفوظ است.",
                'about_en' => "We started in 2019 with one espresso machine and a love for fresh coffee.\nWe roast our beans every week, bake bread and cakes every morning, and change the menu with the seasons.",
                'phone' => '021-88776655',
                'instagram' => '@cafe.dam',
                'address_fa' => 'تهران، خیابان ولیعصر، بالاتر از پارک ساعی، پلاک ۱۲۴۰',
                'address_en' => '1240 Valiasr St, above Saei Park, Tehran',
                'map_url' => 'https://www.google.com/maps/search/?api=1&query=Saei+Park+Tehran',
                'mini_site_enabled' => true,
            ],
        ));

        $settings->put($tid, 'cafe', 'engagement', array_merge(
            $settings->get($tid, 'cafe', 'engagement', ModuleSettingsService::cafeEngagementDefaults()),
            ['phone_gate_enabled' => false, 'likes_enabled' => true, 'feedback_enabled' => true],
        ));
    }

    /** @return array<string, int> */
    private function seedAllergens(int $tid): array
    {
        $defs = [
            'dairy' => ['لبنیات', 'Dairy'],
            'gluten' => ['گلوتن', 'Gluten'],
            'egg' => ['تخم‌مرغ', 'Egg'],
            'nuts' => ['مغزها', 'Nuts'],
        ];
        $ids = [];
        $i = 0;
        foreach ($defs as $slug => [$fa, $en]) {
            $ids[$slug] = (int) Allergen::query()->updateOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                ['name_fa' => $fa, 'name_en' => $en, 'sort_order' => $i++],
            )->id;
        }

        return $ids;
    }

    /** @return array<string, int> */
    private function seedMenus(int $tid): array
    {
        $defs = [
            'cafe' => ['کافه', 'cafe', 'قهوه‌ی تخصصی، دمنوش و دسرهای خانگی'],
            'cold-bar' => ['بار سرد', 'bar', 'نوشیدنی‌های سرد و قهوه‌های یخ‌زده'],
            'kitchen' => ['آشپزخانه', 'restaurant', 'صبحانه و ساندویچ‌های گرم، تا ساعت ۲۳'],
        ];
        $ids = [];
        $i = 0;
        foreach ($defs as $slug => [$name, $type, $desc]) {
            $ids[$slug] = (int) Menu::query()->updateOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                ['name' => $name, 'menu_type' => $type, 'locale' => 'fa', 'is_active' => true, 'sort_order' => $i++, 'description' => $desc],
            )->id;
        }

        return $ids;
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> slug => [name, image, menu] */
    private function categoryDefs(): array
    {
        return [
            'hot-coffee' => ['قهوه گرم', 'hot', 'cafe'],
            'cold-coffee' => ['قهوه سرد', 'cold', 'cold-bar'],
            'herbal-tea' => ['دمنوش', 'tea', 'cafe'],
            'cake-dessert' => ['کیک و دسر', 'dessert', 'cafe'],
            'breakfast' => ['صبحانه', 'breakfast', 'kitchen'],
            'sandwich' => ['ساندویچ', 'sandwich', 'kitchen'],
        ];
    }

    /** @return array<string, int> */
    private function seedCategories(int $tid): array
    {
        $ids = [];
        $i = 0;
        foreach ($this->categoryDefs() as $slug => [$name, $image]) {
            $ids[$slug] = (int) Category::query()->updateOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                [
                    'name' => $name,
                    'image_url' => self::IMG."/cat/{$image}.webp",
                    'cover_image_url' => self::IMG."/cat/{$image}.webp",
                    'display_mode' => 'grid',
                    'sort_order' => $i++,
                    'status' => 'publish',
                    'meta' => ['demo' => self::DEMO_TAG],
                ],
            )->id;
        }

        return $ids;
    }

    /**
     * @param  array<string, int>  $menus
     * @param  array<string, int>  $categories
     * @param  array<string, int>  $allergens
     */
    private function seedProducts(int $tid, array $menus, array $categories, array $allergens): int
    {
        $defs = $this->categoryDefs();
        $order = 0;
        foreach ($this->items() as $item) {
            $menuSlug = $defs[$item['cat']][2];
            $product = Product::query()->updateOrCreate(
                ['tenant_id' => $tid, 'slug' => $item['slug']],
                [
                    'category_id' => $categories[$item['cat']],
                    'menu_id' => $menus[$menuSlug],
                    'name' => $item['name'],
                    'english_name' => $item['en'],
                    'description' => $item['desc'],
                    'short_description' => $item['desc'],
                    'image_url' => self::IMG."/items/{$item['slug']}.webp",
                    'cover_image_url' => self::IMG."/items/{$item['slug']}.webp",
                    'price_minor' => $item['price'] * 10,
                    'sale_price_minor' => isset($item['sale']) ? $item['sale'] * 10 : null,
                    'sale_starts_at' => null,
                    'sale_ends_at' => null,
                    'discount_percent' => 0,
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
                    'meta' => ['demo' => self::DEMO_TAG],
                ],
            );

            $product->allergens()->sync(array_values(array_intersect_key($allergens, array_flip($item['allergens'] ?? []))));

            ProductModifier::query()->where('product_id', $product->id)->delete();
            foreach ($this->modifierSet($item['mods'] ?? null) as $index => $group) {
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

        return $order;
    }

    /** @param  array<string, int>  $menus */
    private function seedBanners(int $tid, array $menus): void
    {
        $defs = [
            ['coffee-friends', 'قهوه‌ی دوستانه: دومین لاته با ۲۰٪ تخفیف', 'Second latte 20% off', '/catalogue#cat-hot-coffee', 'cafe'],
            ['brunch', 'برانچ آخر هفته، پنجشنبه و جمعه از ساعت ۹', 'Weekend brunch from 9am', '/catalogue#cat-breakfast', 'kitchen'],
            ['beans', 'دانه‌ی تازه رست هفته: اتیوپی یرگاچفه', 'Fresh roast of the week: Ethiopia Yirgacheffe', '/catalogue#cat-cold-coffee', null],
        ];
        foreach ($defs as $i => [$image, $fa, $en, $link, $menu]) {
            MenuBanner::query()->updateOrCreate(
                ['tenant_id' => $tid, 'image_url' => self::IMG."/banner/{$image}.webp"],
                ['title_fa' => $fa, 'title_en' => $en, 'link_url' => $link, 'sort_order' => $i, 'is_active' => true, 'menu_id' => $menu ? $menus[$menu] : null],
            );
        }
    }

    private function seedBranches(int $tid): void
    {
        $defs = [
            ['valiasr', 'شعبه ولیعصر', 'Valiasr branch', 'تهران، ولیعصر، بالاتر از پارک ساعی', '021-88776655'],
            ['saadat-abad', 'شعبه سعادت‌آباد', 'Saadat Abad branch', 'تهران، سعادت‌آباد، میدان کاج', '021-22334455'],
        ];
        foreach ($defs as $i => [$slug, $fa, $en, $address, $phone]) {
            CafeBranch::query()->updateOrCreate(
                ['tenant_id' => $tid, 'slug' => $slug],
                ['name_fa' => $fa, 'name_en' => $en, 'address_fa' => $address, 'phone' => $phone, 'is_active' => true, 'sort_order' => $i],
            );
        }
    }

    private function seedEvents(int $tid): void
    {
        $base = now('Asia/Tehran')->startOfDay();
        $defs = [
            ['Live acoustic night', 'شب موسیقی زنده', 'گیتار آکوستیک و آواز، همراه با منوی ویژه‌ی شب.', 'Acoustic guitar and vocals with a special evening menu.', $base->copy()->next(4)->setTime(20, 30), 40, 250000],
            ['Latte art workshop', 'کارگاه لاته آرت', 'دو ساعت تمرین با باریستای ارشد کافه؛ شیر و قهوه با ما.', 'Two hands-on hours with our head barista.', $base->copy()->next(6)->setTime(17, 0), 12, 450000],
        ];
        foreach ($defs as [$en, $fa, $descFa, $descEn, $start, $capacity, $toman]) {
            CafeEvent::query()->updateOrCreate(
                ['tenant_id' => $tid, 'title_en' => $en],
                [
                    'title_fa' => $fa,
                    'description_fa' => $descFa,
                    'description_en' => $descEn,
                    'starts_at' => $start->copy()->utc(),
                    'ends_at' => $start->copy()->addHours(2)->utc(),
                    'capacity' => $capacity,
                    'price_minor' => $toman * 10,
                    'is_active' => true,
                ],
            );
        }
    }

    /**
     * @return list<array{fa: string, en: string, min: int, max: int, options: list<array{0: string, 1: string, 2: int, 3: bool}>}>
     */
    private function modifierSet(?string $set): array
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
        $syrup = ['fa' => 'سیروپ', 'en' => 'Syrup', 'min' => 0, 'max' => 2, 'options' => [
            ['وانیل', 'Vanilla', 15000, false],
            ['کارامل', 'Caramel', 15000, false],
            ['فندق', 'Hazelnut', 18000, false],
        ]];

        return match ($set) {
            'espresso' => [$shot],
            'coffee' => [$size, $milk, $shot],
            'latte' => [$size, $milk, $shot, $syrup],
            'cold' => [$size, $milk, $shot],
            'tea' => [
                ['fa' => 'سرو', 'en' => 'Serving', 'min' => 1, 'max' => 1, 'options' => [
                    ['فنجانی', 'Cup', 0, true],
                    ['قوری دو نفره', 'Pot for two', 65000, false],
                ]],
                ['fa' => 'شیرین‌کننده', 'en' => 'Sweetener', 'min' => 0, 'max' => 1, 'options' => [
                    ['نبات زعفرانی', 'Saffron rock candy', 0, false],
                    ['عسل', 'Honey', 12000, false],
                ]],
            ],
            'dessert' => [
                ['fa' => 'همراه', 'en' => 'Add on', 'min' => 0, 'max' => 2, 'options' => [
                    ['یک اسکوپ بستنی وانیل', 'Vanilla ice cream scoop', 38000, false],
                    ['سس شکلات داغ', 'Hot chocolate sauce', 18000, false],
                ]],
            ],
            'breakfast' => [
                ['fa' => 'نان', 'en' => 'Bread', 'min' => 1, 'max' => 1, 'options' => [
                    ['نان تست خانگی', 'House toast', 0, true],
                    ['نان ساوردو', 'Sourdough', 20000, false],
                ]],
                ['fa' => 'افزودنی', 'en' => 'Extras', 'min' => 0, 'max' => 3, 'options' => [
                    ['آووکادو', 'Avocado', 48000, false],
                    ['پنیر چدار', 'Cheddar', 32000, false],
                    ['تخم‌مرغ اضافه', 'Extra egg', 22000, false],
                ]],
            ],
            'sandwich' => [
                ['fa' => 'کنار غذا', 'en' => 'Side', 'min' => 0, 'max' => 1, 'options' => [
                    ['سیب‌زمینی سرخ‌کرده', 'Fries', 65000, false],
                    ['سالاد کلم', 'Coleslaw', 35000, false],
                ]],
            ],
            default => [],
        };
    }

    /**
     * Prices are in Toman (stored ×10 as Rial minor units).
     *
     * @return list<array<string, mixed>>
     */
    private function items(): array
    {
        return [
            // قهوه گرم
            ['slug' => 'espresso', 'cat' => 'hot-coffee', 'name' => 'اسپرسو', 'en' => 'Espresso', 'price' => 85000, 'desc' => 'دوپیو از بلند اختصاصی کافه، ۷۰٪ عربیکا؛ کرمای غلیظ با نت شکلات تلخ و فندق.', 'mods' => 'espresso', 'kcal' => 5, 'tags' => ['featured']],
            ['slug' => 'americano', 'cat' => 'hot-coffee', 'name' => 'آمریکانو', 'en' => 'Americano', 'price' => 95000, 'desc' => 'دو شات اسپرسو روی آب داغ؛ سبک، خوش‌عطر و بدون تلخی آزاردهنده.', 'mods' => 'coffee', 'kcal' => 10],
            ['slug' => 'cappuccino', 'cat' => 'hot-coffee', 'name' => 'کاپوچینو', 'en' => 'Cappuccino', 'price' => 125000, 'desc' => 'اسپرسو، شیر بخارداده و فوم مخملی به نسبت کلاسیک ایتالیایی.', 'mods' => 'latte', 'kcal' => 120, 'allergens' => ['dairy'], 'tags' => ['featured']],
            ['slug' => 'latte', 'cat' => 'hot-coffee', 'name' => 'کافه لاته', 'en' => 'Caffè latte', 'price' => 135000, 'desc' => 'شیر فراوان و یک لایه‌ی نازک فوم با لاته آرت؛ نرم و آرام.', 'mods' => 'latte', 'kcal' => 190, 'allergens' => ['dairy']],
            ['slug' => 'flat-white', 'cat' => 'hot-coffee', 'name' => 'فلت وایت', 'en' => 'Flat white', 'price' => 130000, 'desc' => 'ریسترتوی دوبل با میکروفوم براق؛ قهوه‌ای‌تر و پرطعم‌تر از لاته.', 'mods' => 'coffee', 'kcal' => 140, 'allergens' => ['dairy'], 'tags' => ['new']],
            ['slug' => 'caramel-macchiato', 'cat' => 'hot-coffee', 'name' => 'کارامل ماکیاتو', 'en' => 'Caramel macchiato', 'price' => 155000, 'desc' => 'شیر وانیلی، اسپرسو و سس کارامل خانگی که روی فوم تور می‌شود.', 'mods' => 'latte', 'kcal' => 240, 'allergens' => ['dairy']],
            ['slug' => 'turkish-coffee', 'cat' => 'hot-coffee', 'name' => 'قهوه ترک', 'en' => 'Turkish coffee', 'price' => 95000, 'desc' => 'دم‌شده روی شن داغ با هل تازه، همراه با یک تکه لوکوم.', 'kcal' => 15],

            // قهوه سرد
            ['slug' => 'iced-latte', 'cat' => 'cold-coffee', 'name' => 'آیس لاته', 'en' => 'Iced latte', 'price' => 145000, 'sale' => 125000, 'desc' => 'اسپرسوی دوبل روی شیر سرد و یخ؛ پرطرفدارترین نوشیدنی تابستان.', 'mods' => 'cold', 'kcal' => 160, 'allergens' => ['dairy'], 'tags' => ['featured']],
            ['slug' => 'iced-americano', 'cat' => 'cold-coffee', 'name' => 'آیس آمریکانو', 'en' => 'Iced americano', 'price' => 105000, 'desc' => 'دو شات اسپرسو، آب خنک و یخ؛ بی‌قند و سرحال‌کننده.', 'mods' => 'cold', 'kcal' => 10],
            ['slug' => 'cold-brew', 'cat' => 'cold-coffee', 'name' => 'کلد برو', 'en' => 'Cold brew', 'price' => 140000, 'desc' => 'دم سرد ۱۸ ساعته از دانه‌ی اتیوپی؛ شیرینی طبیعی و اسیدیته‌ی ملایم.', 'kcal' => 5, 'tags' => ['new']],
            ['slug' => 'iced-caramel-macchiato', 'cat' => 'cold-coffee', 'name' => 'آیس کارامل ماکیاتو', 'en' => 'Iced caramel macchiato', 'price' => 165000, 'desc' => 'لایه‌های شیر سرد، اسپرسو و کارامل نمکی روی یخ.', 'mods' => 'cold', 'kcal' => 230, 'allergens' => ['dairy']],
            ['slug' => 'mocha-frappe', 'cat' => 'cold-coffee', 'name' => 'فراپه موکا', 'en' => 'Mocha frappé', 'price' => 185000, 'desc' => 'قهوه، شکلات بلژیکی و یخ خردشده با خامه و بیسکویت اورئو.', 'kcal' => 420, 'allergens' => ['dairy', 'gluten'], 'tags' => ['new']],
            ['slug' => 'affogato', 'cat' => 'cold-coffee', 'name' => 'آفوگاتو', 'en' => 'Affogato', 'price' => 160000, 'desc' => 'یک اسکوپ بستنی وانیل ماداگاسکار غرق در اسپرسوی داغ.', 'kcal' => 210, 'allergens' => ['dairy']],

            // دمنوش
            ['slug' => 'masala-chai', 'cat' => 'herbal-tea', 'name' => 'چای ماسالا', 'en' => 'Masala chai', 'price' => 125000, 'desc' => 'چای سیاه دم‌کشیده با دارچین، زنجبیل، هل و شیر؛ گرم و ادویه‌ای.', 'kcal' => 150, 'allergens' => ['dairy'], 'spice' => 1, 'tags' => ['featured']],
            ['slug' => 'lemon-verbena', 'cat' => 'herbal-tea', 'name' => 'دمنوش به‌لیمو و نعناع', 'en' => 'Lemon verbena & mint', 'price' => 90000, 'desc' => 'برگ تازه‌ی به‌لیمو و نعناع شمال؛ آرام‌بخش، مناسب عصر.', 'mods' => 'tea', 'kcal' => 0],
            ['slug' => 'green-tea', 'cat' => 'herbal-tea', 'name' => 'چای سبز یاسمن', 'en' => 'Jasmine green tea', 'price' => 85000, 'desc' => 'چای سبز چینی با گل یاسمن، سروشده در قوری چدنی.', 'mods' => 'tea', 'kcal' => 0],
            ['slug' => 'matcha-latte', 'cat' => 'herbal-tea', 'name' => 'ماچا لاته', 'en' => 'Matcha latte', 'price' => 175000, 'desc' => 'ماچای سرمونیال ژاپنی با شیر بخارداده؛ انرژی آرام و طعم چمنی لطیف.', 'mods' => 'coffee', 'kcal' => 170, 'allergens' => ['dairy'], 'tags' => ['new']],
            ['slug' => 'iced-tea', 'cat' => 'herbal-tea', 'name' => 'آیس تی لیمو', 'en' => 'Lemon iced tea', 'price' => 115000, 'desc' => 'چای سیاه سرددم، لیموی تازه و کمی عسل روی یخ.', 'kcal' => 60],

            // کیک و دسر
            ['slug' => 'chocolate-cake', 'cat' => 'cake-dessert', 'name' => 'کیک شکلاتی گاناش', 'en' => 'Chocolate ganache cake', 'price' => 165000, 'desc' => 'سه لایه کیک خیس شکلاتی با گاناش ۷۰٪ و پودر کاکائوی هلندی.', 'mods' => 'dessert', 'kcal' => 480, 'allergens' => ['dairy', 'gluten', 'egg'], 'tags' => ['featured']],
            ['slug' => 'blueberry-cheesecake', 'cat' => 'cake-dessert', 'name' => 'چیزکیک بلوبری', 'en' => 'Blueberry cheesecake', 'price' => 175000, 'desc' => 'چیزکیک پخته با پنیر خامه‌ای و سس بلوبری تازه روی بیس کره‌ای.', 'kcal' => 430, 'allergens' => ['dairy', 'gluten', 'egg']],
            ['slug' => 'new-york-cheesecake', 'cat' => 'cake-dessert', 'name' => 'چیزکیک نیویورکی', 'en' => 'New York cheesecake', 'price' => 165000, 'desc' => 'کلاسیک، غلیظ و لیمویی؛ با یک توت‌فرنگی تازه.', 'kcal' => 410, 'allergens' => ['dairy', 'gluten', 'egg']],
            ['slug' => 'tiramisu', 'cat' => 'cake-dessert', 'name' => 'تیرامیسو', 'en' => 'Tiramisu', 'price' => 170000, 'desc' => 'لیدی‌فینگر خیس‌خورده در اسپرسو با کرم ماسکارپونه و کاکائو.', 'mods' => 'dessert', 'kcal' => 390, 'allergens' => ['dairy', 'gluten', 'egg'], 'tags' => ['new']],
            ['slug' => 'brownie', 'cat' => 'cake-dessert', 'name' => 'براونی گردویی', 'en' => 'Walnut brownie', 'price' => 120000, 'sale' => 96000, 'desc' => 'براونی فاج‌مانند با گردوی برشته؛ گرم سرو می‌شود.', 'mods' => 'dessert', 'kcal' => 360, 'allergens' => ['dairy', 'gluten', 'egg', 'nuts']],
            ['slug' => 'panna-cotta', 'cat' => 'cake-dessert', 'name' => 'پاناکوتا توت‌فرنگی', 'en' => 'Strawberry panna cotta', 'price' => 140000, 'desc' => 'خامه‌ی وانیلی ژله‌ای با سس و تکه‌های توت‌فرنگی تازه.', 'kcal' => 280, 'allergens' => ['dairy']],
            ['slug' => 'croissant', 'cat' => 'cake-dessert', 'name' => 'کروسان کره‌ای', 'en' => 'Butter croissant', 'price' => 95000, 'desc' => 'ورق‌ورق، تازه از فر هر صبح؛ با کره‌ی فرانسوی.', 'kcal' => 270, 'allergens' => ['dairy', 'gluten']],

            // صبحانه
            ['slug' => 'english-breakfast', 'cat' => 'breakfast', 'name' => 'صبحانه انگلیسی', 'en' => 'English breakfast', 'price' => 285000, 'desc' => 'دو تخم‌مرغ نیمرو، سوسیس، لوبیا، قارچ و گوجه‌ی گریل با نان تست.', 'mods' => 'breakfast', 'kcal' => 780, 'allergens' => ['egg', 'gluten'], 'tags' => ['featured']],
            ['slug' => 'avocado-egg-toast', 'cat' => 'breakfast', 'name' => 'تست آووکادو و تخم‌مرغ', 'en' => 'Avocado egg toast', 'price' => 245000, 'desc' => 'نان ساوردو، آووکادوی له‌شده با لیمو، تخم‌مرغ عسلی و پولبیبر.', 'mods' => 'breakfast', 'kcal' => 520, 'allergens' => ['egg', 'gluten'], 'spice' => 1, 'tags' => ['new']],
            ['slug' => 'pancake', 'cat' => 'breakfast', 'name' => 'پنکیک بلوبری', 'en' => 'Blueberry pancakes', 'price' => 225000, 'sale' => 199000, 'desc' => 'سه پنکیک پفکی با بلوبری، موز، کره و شیره‌ی افرا.', 'kcal' => 610, 'allergens' => ['dairy', 'gluten', 'egg']],
            ['slug' => 'french-toast', 'cat' => 'breakfast', 'name' => 'فرنچ تست', 'en' => 'French toast', 'price' => 210000, 'desc' => 'نان بریوش آغشته به تخم‌مرغ و دارچین، با میوه‌ی فصل و عسل.', 'kcal' => 560, 'allergens' => ['dairy', 'gluten', 'egg']],
            ['slug' => 'healthy-plate', 'cat' => 'breakfast', 'name' => 'بشقاب صبحانه سلامت', 'en' => 'Healthy breakfast plate', 'price' => 265000, 'desc' => 'تخم‌مرغ آب‌پز، آووکادو، سالاد سبز، پنیر فتا و نان چاودار.', 'mods' => 'breakfast', 'kcal' => 450, 'allergens' => ['egg', 'dairy', 'gluten']],

            // ساندویچ
            ['slug' => 'club-sandwich', 'cat' => 'sandwich', 'name' => 'کلاب ساندویچ', 'en' => 'Club sandwich', 'price' => 295000, 'sale' => 250000, 'desc' => 'سه طبقه نان تست با مرغ گریل، بیکن بوقلمون، تخم‌مرغ، کاهو و گوجه.', 'mods' => 'sandwich', 'kcal' => 690, 'allergens' => ['egg', 'gluten'], 'tags' => ['featured']],
            ['slug' => 'chicken-panini', 'cat' => 'sandwich', 'name' => 'پنینی مرغ و پستو', 'en' => 'Chicken pesto panini', 'price' => 255000, 'desc' => 'سینه‌ی مرغ گریل، سس پستوی ریحان، موتزارلا و گوجه‌ی خشک.', 'mods' => 'sandwich', 'kcal' => 610, 'allergens' => ['dairy', 'gluten', 'nuts']],
            ['slug' => 'turkey-sandwich', 'cat' => 'sandwich', 'name' => 'ساندویچ بوقلمون', 'en' => 'Turkey sandwich', 'price' => 245000, 'desc' => 'ژامبون بوقلمون، پنیر گودا، کاهو و سس عسل‌خردل روی نان چاودار.', 'mods' => 'sandwich', 'kcal' => 540, 'allergens' => ['dairy', 'gluten']],
            ['slug' => 'italian-baguette', 'cat' => 'sandwich', 'name' => 'باگت ایتالیایی', 'en' => 'Italian baguette', 'price' => 275000, 'desc' => 'باگت تازه با سالامی، پروولونه، روکولا و سس سیر کبابی.', 'mods' => 'sandwich', 'kcal' => 650, 'allergens' => ['dairy', 'gluten'], 'spice' => 1],
            ['slug' => 'roast-beef', 'cat' => 'sandwich', 'name' => 'ساندویچ رست بیف', 'en' => 'Roast beef sandwich', 'price' => 345000, 'desc' => 'رست بیف آرام‌پز، پیاز کاراملی، پنیر چدار و سس هورسرادیش.', 'mods' => 'sandwich', 'kcal' => 720, 'allergens' => ['dairy', 'gluten'], 'spice' => 2, 'tags' => ['new']],
            ['slug' => 'cafe-burger', 'cat' => 'sandwich', 'name' => 'برگر مخصوص کافه', 'en' => 'House burger', 'price' => 365000, 'desc' => '۱۸۰ گرم گوشت گوساله، چدار ذوب‌شده، پیاز کاراملی و سس مخصوص در نان بریوش.', 'mods' => 'sandwich', 'kcal' => 850, 'allergens' => ['dairy', 'gluten', 'egg'], 'spice' => 1, 'tags' => ['featured']],
        ];
    }
}
