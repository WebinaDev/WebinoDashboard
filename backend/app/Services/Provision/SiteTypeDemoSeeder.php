<?php

namespace App\Services\Provision;

use App\Kernel\SiteTypeProfiles;
use App\Kernel\ThemeCatalog;
use App\Models\BuilderTemplate;
use App\Models\Category;
use App\Models\MagazineArticle;
use App\Models\Menu;
use App\Models\Product;
use App\Models\ResumeProfile;
use App\Models\Tenant;
use App\Services\Builder\BuilderDocumentRules;
use App\Services\Builder\ThemePresetLibrary;
use App\Services\Modules\ModuleSettingsService;

/**
 * Industry-aware starter content + suggested theme for each SiteTypeProfiles type.
 *
 * Auto-runs only for NEW / never-seeded empty sites. Upgrade, redeploy, license sync,
 * and applySiteType on existing sites must not wipe content. Use $force only for
 * explicit admin «import demo». Inserts stay idempotent (firstOrCreate) when forced.
 */
class SiteTypeDemoSeeder
{
    public const DEMO_TAG = 'site-type-demo';

    /** Stored under tenant.branding — blocks implicit re-seed after first run. */
    public const META_SEEDED_AT = 'demo_seeded_at';

    public function __construct(
        protected ProvisionContentSeeder $pagesSeeder,
        protected ThemePresetLibrary $presets,
        protected ModuleSettingsService $settings,
    ) {}

    /**
     * Implicit demo/template seeding: unfinished + never seeded + no real content.
     */
    public function shouldAutoSeed(Tenant $tenant): bool
    {
        if ((bool) $tenant->setup_completed) {
            return false;
        }

        if ($this->hasBeenSeeded($tenant)) {
            return false;
        }

        return $this->appearsEmpty($tenant);
    }

    public function hasBeenSeeded(Tenant $tenant): bool
    {
        $branding = is_array($tenant->branding) ? $tenant->branding : [];

        return filled($branding[self::META_SEEDED_AT] ?? null);
    }

    /**
     * Legacy / mid-setup guard: any catalog/CMS/builder content ⇒ do not auto-seed.
     */
    public function appearsEmpty(Tenant $tenant): bool
    {
        $tid = (int) $tenant->id;

        if (Product::query()->where('tenant_id', $tid)->exists()) {
            return false;
        }
        if (\App\Models\CmsPage::query()->where('tenant_id', $tid)->exists()) {
            return false;
        }
        if (\App\Models\BlogPost::query()->where('tenant_id', $tid)->exists()) {
            return false;
        }
        if (MagazineArticle::query()->where('tenant_id', $tid)->exists()) {
            return false;
        }
        if (BuilderTemplate::query()->where('tenant_id', $tid)->exists()) {
            return false;
        }

        $resume = ResumeProfile::query()->where('tenant_id', $tid)->first();
        if ($resume && (filled($resume->full_name) || filled($resume->headline))) {
            return false;
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $seed  Optional provision seed overrides
     * @param  bool  $force  Explicit admin/CLI action — bypasses new-site gate
     */
    public function seed(Tenant $tenant, ?string $siteType = null, array $seed = [], bool $force = false): void
    {
        if (! $force && ! $this->shouldAutoSeed($tenant)) {
            return;
        }

        $type = $siteType
            ?? $seed['site_type_slug']
            ?? $seed['business_type_slug']
            ?? $tenant->site_type_slug
            ?? $tenant->business_type_slug;

        if (! is_string($type) || ! SiteTypeProfiles::isValid($type)) {
            $this->pagesSeeder->seed($tenant, $seed);
            $this->markSeeded($tenant);

            return;
        }

        $theme = $seed['active_theme_slug']
            ?? ThemeCatalog::resolveDefaultSlug($type, is_array($tenant->branding) ? $tenant->branding : null)
            ?? ThemeCatalog::suggestedDefaultForSiteType($type);

        if (is_string($theme) && ThemeCatalog::isAllowedForSiteType($theme, $type)) {
            $tenant->active_theme_slug = $theme;
            $tenant->theme_preset = $type;
            $tenant->save();
        }

        match ($type) {
            'ecommerce', 'coffee' => $this->seedStore($tenant, $type, $seed),
            'cafe' => $this->seedCafe($tenant, $seed),
            'resume' => $this->seedResume($tenant, $seed),
            'magazine' => $this->seedMagazine($tenant, $seed),
            'corporate' => $this->pagesSeeder->seed($tenant, array_merge(
                ['business_category_slug' => 'corporate'],
                $seed,
            )),
            default => $this->pagesSeeder->seed($tenant, $seed),
        };

        $this->markSeeded($tenant);
    }

    protected function markSeeded(Tenant $tenant): void
    {
        $tenant->refresh();
        $branding = is_array($tenant->branding) ? $tenant->branding : [];
        if (filled($branding[self::META_SEEDED_AT] ?? null)) {
            return;
        }
        $branding[self::META_SEEDED_AT] = now()->toIso8601String();
        $tenant->branding = $branding;
        $tenant->save();
    }

    /** @param  array<string, mixed>  $seed */
    protected function seedStore(Tenant $tenant, string $type, array $seed): void
    {
        $brand = (string) ($tenant->store_display_name ?: $tenant->name ?: 'ویبینو');
        $isCoffee = $type === 'coffee';

        $this->pagesSeeder->seed($tenant, array_merge([
            'default_pages' => [
                [
                    'slug' => 'about',
                    'title' => $isCoffee ? 'درباره ما' : 'درباره فروشگاه',
                    'body' => $isCoffee
                        ? "{$brand} فروش تخصصی قهوه و تجهیزات دم‌آوری روی پلتفرم ویبینو است."
                        : "{$brand} یک فروشگاه نمونه روی ویبینو است؛ محصولات دمو فقط برای شروع کار هستند.",
                ],
                [
                    'slug' => 'shipping',
                    'title' => 'ارسال و تحویل',
                    'body' => 'ارسال نمونه به سراسر ایران — این متن دمو است و از تنظیمات فروشگاه قابل ویرایش است.',
                ],
                [
                    'slug' => 'privacy',
                    'title' => 'حریم خصوصی',
                    'body' => 'سیاست حریم خصوصی نمونه ویبینو. متن را با سیاست واقعی کسب‌وکار خود جایگزین کنید.',
                ],
            ],
            'sample_blog_post' => [
                'slug' => 'welcome-webina',
                'title' => 'خوش آمدید به ویبینو',
                'excerpt' => 'شروع سریع فروشگاه با قالب و دادهٔ نمونه.',
                'body' => 'این نوشتهٔ دمو پس از ساخت سایت اضافه شده است. می‌توانید آن را ویرایش یا حذف کنید.',
            ],
        ], $seed));

        $catSlug = $isCoffee ? 'coffee-beans' : 'webina-samples';
        $category = Category::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => $catSlug],
            [
                'name' => $isCoffee ? 'دانه‌های قهوه' : 'نمونه محصولات ویبینو',
                'description' => $isCoffee ? 'دانه‌های نمونه برای فروشگاه قهوه' : 'محصولات نمایشی فروشگاه',
                'sort_order' => 0,
                'status' => 'publish',
                'meta' => ['demo' => self::DEMO_TAG],
            ]
        );

        $products = $isCoffee
            ? [
                ['slug' => 'ethiopia-yirgacheffe', 'name' => 'اتیوپی یرگاچفه', 'price' => 4850000, 'desc' => 'اسیدیته روشن، نت گل و مرکبات — نمونه ویبینو.'],
                ['slug' => 'brazil-santos', 'name' => 'برزیل سانتوس', 'price' => 3650000, 'desc' => 'بادی متوسط، شکلاتی ملایم برای اسپرسو روزانه.'],
                ['slug' => 'v60-dripper', 'name' => 'دریپر V60', 'price' => 1250000, 'desc' => 'تجهیزات دم‌آوری نمونه برای شروع فروشگاه قهوه.'],
            ]
            : [
                ['slug' => 'webina-starter-kit', 'name' => 'کیت شروع ویبینو', 'price' => 990000, 'desc' => 'بستهٔ نمونه برای نمایش ویترین فروشگاه روی ویبینو.'],
                ['slug' => 'webina-care-serum', 'name' => 'سرم مراقبت ویبینو', 'price' => 1450000, 'desc' => 'محصول زیبایی نمونه با توضیح کوتاه و قیمت نمایشی.'],
                ['slug' => 'webina-tote-bag', 'name' => 'کیف پارچه‌ای ویبینو', 'price' => 420000, 'desc' => 'اکسسوری برند نمونه برای تکمیل آرشیو محصولات.'],
            ];

        foreach ($products as $i => $item) {
            Product::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => $item['slug']],
                [
                    'category_id' => $category->id,
                    'name' => $item['name'],
                    'description' => $item['desc'],
                    'short_description' => $item['desc'],
                    'price_minor' => $item['price'] * 10,
                    'currency' => $tenant->default_currency === 'IRR' ? 'IRR' : 'IRT',
                    'stock' => 25,
                    'manage_stock' => true,
                    'stock_status' => 'instock',
                    'is_available' => true,
                    'is_featured' => $i === 0,
                    'status' => 'publish',
                    'type' => 'simple',
                    'catalog_visibility' => 'visible',
                    'sort_order' => $i,
                    'meta' => ['demo' => self::DEMO_TAG, 'brand' => 'Webina'],
                ]
            );
        }

        $this->importBuilderKit($tenant, 'classic-kit');
    }

    /** @param  array<string, mixed>  $seed */
    protected function seedCafe(Tenant $tenant, array $seed): void
    {
        $brand = (string) ($tenant->store_display_name ?: $tenant->name ?: 'کافه ویبینو');

        $this->pagesSeeder->seed($tenant, array_merge([
            'default_pages' => [
                [
                    'slug' => 'about',
                    'title' => 'درباره کافه',
                    'body' => "{$brand} منوی نمونه کافه روی ویبینو است؛ آیتم‌ها را از پنل منو ویرایش کنید.",
                ],
            ],
        ], $seed));

        $tid = (int) $tenant->id;
        $this->settings->put($tid, 'cafe', 'venue', array_merge(
            $this->settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
            [
                'tagline_fa' => 'منوی دیجیتال نمونه ویبینو',
                'tagline_en' => 'Webina sample digital menu',
                'about_fa' => "{$brand} با دادهٔ نمونه راه‌اندازی شده است تا قالب کافه را ببینید.",
                'about_en' => "{$brand} ships with sample cafe content so you can preview the theme.",
                'mini_site_enabled' => true,
            ],
        ));

        $menu = Menu::query()->firstOrCreate(
            ['tenant_id' => $tid, 'slug' => 'main-menu'],
            [
                'name' => 'منوی اصلی',
                'menu_type' => 'cafe',
                'locale' => 'fa',
                'is_active' => true,
                'sort_order' => 0,
                'description' => 'منوی نمونه کافه ویبینو',
            ]
        );

        $category = Category::query()->firstOrCreate(
            ['tenant_id' => $tid, 'slug' => 'hot-drinks'],
            [
                'name' => 'نوشیدنی گرم',
                'sort_order' => 0,
                'status' => 'publish',
                'display_mode' => 'grid',
                'meta' => ['demo' => self::DEMO_TAG],
            ]
        );

        $items = [
            ['slug' => 'cafe-latte', 'name' => 'لاته', 'en' => 'Latte', 'price' => 185000, 'desc' => 'اسپرسو و شیر بخار — نمونه منو ویبینو'],
            ['slug' => 'cafe-cappuccino', 'name' => 'کاپوچینو', 'en' => 'Cappuccino', 'price' => 175000, 'desc' => 'کف شیر کلاسیک برای نمایش قالب کافه'],
            ['slug' => 'cafe-mocha', 'name' => 'موکا', 'en' => 'Mocha', 'price' => 195000, 'desc' => 'شکلات و اسپرسو — آیتم دمو'],
            ['slug' => 'cafe-herbal', 'name' => 'دمنوش آرام‌بخش', 'en' => 'Herbal tea', 'price' => 145000, 'desc' => 'دمنوش نمونه برای دسته نوشیدنی گرم'],
        ];

        foreach ($items as $i => $item) {
            Product::query()->firstOrCreate(
                ['tenant_id' => $tid, 'slug' => $item['slug']],
                [
                    'category_id' => $category->id,
                    'menu_id' => $menu->id,
                    'name' => $item['name'],
                    'english_name' => $item['en'],
                    'description' => $item['desc'],
                    'short_description' => $item['desc'],
                    'price_minor' => $item['price'] * 10,
                    'currency' => 'IRR',
                    'stock' => 50,
                    'manage_stock' => false,
                    'stock_status' => 'instock',
                    'is_available' => true,
                    'is_featured' => $i < 2,
                    'status' => 'publish',
                    'type' => 'simple',
                    'catalog_visibility' => 'visible',
                    'sort_order' => $i,
                    'meta' => ['demo' => self::DEMO_TAG],
                ]
            );
        }
    }

    /** @param  array<string, mixed>  $seed */
    protected function seedResume(Tenant $tenant, array $seed): void
    {
        $this->pagesSeeder->seed($tenant, array_merge([
            'default_pages' => [
                [
                    'slug' => 'contact',
                    'title' => 'تماس',
                    'body' => 'از فرم تماس رزومه یا لینک‌های شبکه‌های اجتماعی استفاده کنید.',
                ],
            ],
        ], $seed));

        $name = (string) ($tenant->store_display_name ?: $tenant->name ?: 'کاربر ویبینو');
        $row = ResumeProfile::query()->firstOrCreate(
            ['tenant_id' => $tenant->id],
            [
                'full_name' => '',
                'published' => false,
                'experience' => [],
                'education' => [],
                'skills' => [],
                'projects' => [],
                'social_links' => [],
            ]
        );

        if (filled($row->full_name) || filled($row->headline)) {
            return;
        }

        $row->fill([
            'full_name' => $name,
            'headline' => 'طراح محصول و وب — نمونه رزومه ویبینو',
            'summary' => 'این رزومهٔ نمونه پس از ساخت سایت از نوع رزومه اضافه شده است. اطلاعات را با مشخصات واقعی خود جایگزین کنید.',
            'email' => 'hello@webina.ir',
            'phone' => '۰۲۱-۹۱۰۹۱۰۹۱',
            'location' => 'تهران، ایران',
            'experience' => [
                [
                    'title' => 'طراح محصول',
                    'company' => 'ویبینو',
                    'period' => '۱۴۰۱ — اکنون',
                    'description' => 'طراحی تجربهٔ فروشگاه و قالب‌های صنعت‌محور.',
                ],
                [
                    'title' => 'طراح رابط کاربری',
                    'company' => 'استودیو نمونه',
                    'period' => '۱۳۹۸ — ۱۴۰۱',
                    'description' => 'طراحی وب‌سایت‌های شرکتی و فروشگاهی.',
                ],
            ],
            'education' => [
                [
                    'degree' => 'کارشناسی طراحی صنعتی',
                    'school' => 'دانشگاه نمونه',
                    'period' => '۱۳۹۴ — ۱۳۹۸',
                ],
            ],
            'skills' => ['UI/UX', 'Figma', 'Next.js', 'فروشگاه اینترنتی', 'رزومه دیجیتال'],
            'projects' => [
                [
                    'title' => 'قالب فروشگاه ویبینو',
                    'description' => 'ویترین نمونه با محصولات دمو و پوسته‌ساز.',
                    'url' => 'https://webina.ir',
                ],
            ],
            'social_links' => [
                ['label' => 'LinkedIn', 'url' => 'https://linkedin.com'],
                ['label' => 'GitHub', 'url' => 'https://github.com'],
            ],
            'published' => true,
        ]);
        $row->save();
    }

    /** @param  array<string, mixed>  $seed */
    protected function seedMagazine(Tenant $tenant, array $seed): void
    {
        $this->pagesSeeder->seed($tenant, array_merge([
            'default_pages' => [
                [
                    'slug' => 'about',
                    'title' => 'درباره مجله',
                    'body' => 'مجلهٔ آموزشی نمونه روی ویبینو — مقالات دمو را از پنل مجله مدیریت کنید.',
                ],
            ],
            'sample_blog_post' => [
                'slug' => 'magazine-welcome',
                'title' => 'شروع مجله آموزشی',
                'excerpt' => 'اولین یادداشت دمو برای مجله ویبینو.',
                'body' => 'این مطلب وبلاگ همراه با مقالهٔ مجله به‌عنوان محتوای نمونه اضافه شده است.',
            ],
            'sample_academy_course' => [
                'slug' => 'intro-webina',
                'title' => 'آشنایی با ویبینو',
                'description' => 'دورهٔ کوتاه نمونه برای ماژول آکادمی.',
            ],
        ], $seed));

        MagazineArticle::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'getting-started-webina'],
            [
                'title' => 'شروع با قالب مجله ویبینو',
                'excerpt' => 'راهنمای کوتاه برای ویرایش مقالات و سری‌های آموزشی.',
                'body' => "این مقالهٔ نمونه پس از انتخاب نوع سایت «مجله آموزشی» ایجاد شده است.\nعنوان، چکیده و متن را از پنل مجله تغییر دهید.",
                'status' => 'published',
                'published_at' => now(),
                'visibility' => 'public',
            ]
        );

        MagazineArticle::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'content-tips'],
            [
                'title' => 'نکته‌های تولید محتوا',
                'excerpt' => 'چند پیشنهاد کوتاه برای ستون‌های آموزشی.',
                'body' => 'از دسته‌ها و برچسب‌های مجله برای سازمان‌دهی نوشته‌های دمو استفاده کنید.',
                'status' => 'published',
                'published_at' => now()->subDay(),
                'visibility' => 'public',
            ]
        );
    }

    protected function importBuilderKit(Tenant $tenant, string $kitId): void
    {
        if (BuilderTemplate::query()->where('tenant_id', $tenant->id)->exists()) {
            return;
        }

        $kit = $this->presets->find($kitId);
        if (! $kit || ($kit['kind'] ?? '') !== 'kit') {
            return;
        }

        foreach ($kit['includes'] as $id) {
            $item = $this->presets->find((string) $id);
            if (! $item || ($item['kind'] ?? '') === 'kit') {
                continue;
            }
            $kind = (string) $item['kind'];
            $exists = BuilderTemplate::query()
                ->where('tenant_id', $tenant->id)
                ->where('kind', $kind)
                ->exists();
            $row = BuilderTemplate::query()->create([
                'tenant_id' => $tenant->id,
                'kind' => $kind,
                'slug' => $kind.'-'.preg_replace('/[^a-z0-9-]+/', '-', strtolower((string) $item['id'])),
                'title' => (string) $item['title'],
                'is_default' => false,
                'priority' => 0,
                'conditions' => null,
                'draft' => BuilderDocumentRules::normalize(is_array($item['document'] ?? null) ? $item['document'] : null),
            ]);
            if (! $exists) {
                BuilderTemplate::query()
                    ->where('tenant_id', $tenant->id)
                    ->where('kind', $kind)
                    ->where('id', '!=', $row->id)
                    ->update(['is_default' => false]);
                $row->is_default = true;
                $row->save();
            }
        }
    }
}
