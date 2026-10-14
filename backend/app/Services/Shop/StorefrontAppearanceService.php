<?php

namespace App\Services\Shop;

use App\Kernel\ThemeCatalog;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;

/**
 * Classic storefront theme settings (Webino «تنظیمات قالب»).
 * Flat color keys stay for backward compatibility; nested sections mirror Parisma panels.
 */
final class StorefrontAppearanceService
{
    public const MODULE = 'shop';

    public const KEY = 'storefront_appearance';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'primary_color' => '#e775ae',
            'secondary_color' => '#021959',
            'accent_color' => '#dc5f9d',
            'text1_color' => '#021959',
            'text2_color' => '#4d5e8a',
            'text3_color' => '#8b97b3',
            'navy_color' => '#021959',
            'surface_color' => '#f3f5f8',
            'header_bg' => '#ffffff',
            'footer_bg' => '#ffffff',
            'border_color' => '#e8edf3',
            'header_style' => 'classic',
            'mega_menu' => true,
            'dark_mode_default' => false,
            'show_top_bar' => true,
            'top_bar_text' => '',
            'product_card_style' => 'classic',
            'pdp_gallery_style' => 'thumbs',
            'sticky_add_to_cart' => true,
            'show_installment_badge' => true,
            'footer_columns' => 4,
            'typography' => [
                'font_family' => 'yekan-bakh',
                'font_size' => 14,
                'font_weight' => 400,
                'line_height' => 1.7,
                'rating_color' => '#f9bc00',
            ],
            'general' => [
                'logo_height_desktop' => 48,
                'logo_height_mobile' => 36,
                'logo_404_url' => '',
                'bg_404' => '',
                'loading_icon_url' => '',
                'mobile_bottom_menu_enabled' => true,
                'mobile_bottom_menu' => [
                    ['label' => 'خانه', 'href' => '/', 'icon' => 'home'],
                    ['label' => 'دسته‌ها', 'href' => '/shop', 'icon' => 'grid'],
                    ['label' => 'سبد', 'href' => '/cart', 'icon' => 'cart'],
                    ['label' => 'حساب', 'href' => '/account', 'icon' => 'user'],
                ],
            ],
            'header' => [
                'ajax_search' => true,
                'ajax_search_mobile' => true,
                'search_placeholder' => 'جستجوی محصولات',
                'popular_search_keywords' => [],
                'search_banner_image' => '',
                'search_banner_link' => '',
                'voice_search' => false,
                'quick_voice_search' => false,
                'voice_excluded_paths' => '',
                'search_title_only' => false,
                'search_sku' => false,
                'deals_enabled' => true,
                'deals_title' => 'شگفت انگیز',
                'deals_subtitle' => '',
                'deals_link' => '/amazing-offers',
                'deals_timer_end' => '',
                'deals_timer_title' => '',
                'mega_menu' => true,
                'mega_menu_title' => 'دسته‌بندی محصولات',
                'sticky_desktop' => true,
                'banner_enabled' => false,
                'banner_type' => 'image',
                'banner_link' => '',
                'banner_image_desktop' => '',
                'banner_image_mobile' => '',
                'banner_text' => '',
                'banner_bg' => '#021959',
                'banner_text_color' => '#ffffff',
            ],
            'footer' => [
                'about' => '',
                'footer_logo' => '',
                'trust_title' => 'چگونه به ما اعتماد کنید',
                'trust_text' => '',
                'enamad_html' => '',
                'samandehi_html' => '',
                'ecommerce_badge_html' => '',
                'footer_links' => [
                    ['title' => 'راهنمای مشتریان', 'links' => [
                        ['label' => 'حساب کاربری من', 'href' => '/account'],
                        ['label' => 'سبد خرید', 'href' => '/cart'],
                        ['label' => 'پیگیری سفارش', 'href' => '/order-tracking'],
                        ['label' => 'سوالات متداول', 'href' => '/pages/faq'],
                        ['label' => 'تماس با ما', 'href' => '/pages/contact'],
                        ['label' => 'درباره ما', 'href' => '/pages/about'],
                        ['label' => 'شرایط و قوانین', 'href' => '/pages/terms'],
                    ]],
                ],
                'brands_title' => 'برندهای مطرح',
                'brand_links' => [],
                'bestsellers_title' => 'پرفروش‌ترین محصولات',
                'bestsellers_limit' => 6,
                'show_recently_viewed' => true,
                'recently_viewed_title' => 'آخرین محصولاتی که بازدید کردید',
                'service_badges' => [
                    ['title' => 'ارسال سریع', 'text' => 'تحویل اکسپرس', 'icon' => 'truck'],
                    ['title' => 'پرداخت امن', 'text' => 'امکان پرداخت اقساطی', 'icon' => 'card'],
                    ['title' => 'ضمانت بازگشت', 'text' => '۷ روز ضمانت بازگشت کالا', 'icon' => 'shield'],
                    ['title' => 'اصالت کالا', 'text' => 'تضمین اصالت و اورجینال بودن', 'icon' => 'badge'],
                ],
                'copyright_years' => '',
                'copyright' => '',
                'copyright_sub' => '',
                'contact_title' => 'مرکز تماس مشتریان',
                'contact_tagline_1' => 'به صورت شبانه‌روزی پشتیبان شما هستیم',
                'contact_tagline_2' => 'رضایت مشتری برای ما در اولویت است',
                'support_phone' => '',
                'support_email_title' => 'ایمیل پشتیبانی',
                'support_email' => '',
                'support_hours' => '',
                'address_title' => 'آدرس',
                'address' => '',
                'social_title' => 'ما در شبکه‌های اجتماعی',
                'social_instagram' => '',
                'social_telegram' => '',
                'social_twitter' => '',
                'social_whatsapp' => '',
                'social_facebook' => '',
                'social_igap' => '',
                'social_rubika' => '',
                'social_soroush' => '',
                'social_bale' => '',
                'social_eitaa' => '',
                'payment_methods' => [],
                'show_developer_credit' => true,
                'developer_title' => 'طراحی و توسعه توسط',
                'developer_name' => 'توسعه کسب و کار وبینا',
                'developer_link' => 'https://webina.dev',
                'developer_logo' => '',
            ],
            'commerce' => [
                'ajax_add_to_cart' => true,
                'product_share' => true,
                'gallery_lightbox' => true,
                'gallery_thumbs' => 'bottom',
                'important_attrs_count' => 4,
                'features' => [],
                'shipping_text_enabled' => true,
                'shipping_text' => '',
                'installment_enabled' => true,
                'installment_title' => 'خرید اقساطی',
                'installment_text' => '',
                'installment_link' => '',
                'installment_image' => '',
                'card_installment_enabled' => true,
                'card_installment_text' => 'اقساطی',
                'card_installment_image' => '',
                'sticky_cart_mobile' => true,
                'sticky_cart_desktop' => false,
                'sticky_cart_side' => 'bottom',
                'card_add_to_cart' => true,
                'compare_enabled' => true,
                'show_rating' => true,
                'fake_stats_enabled' => false,
                'fake_stats_factor' => 1,
                'fake_stats_sensitivity' => 5,
                'cart_coupon' => true,
                'cart_sticky_summary' => true,
                'cart_deals_countdown' => true,
                'free_shipping_bar_enabled' => false,
                'free_shipping_threshold' => 500000,
                'checkout_coupon' => true,
                'checkout_shipping_quote' => true,
                'checkout_trust_badges' => true,
                'checkout_sticky_summary' => true,
                'checkout_require_phone' => true,
                'checkout_show_recipient' => true,
                'checkout_show_postcode' => true,
                'checkout_require_postcode' => false,
                'checkout_show_note' => true,
                // hidden | optional | required — Iranian national code on checkout.
                'checkout_national_id' => 'hidden',
                // Comma-separated field keys; unknown keys ignored, missing keys appended in default order.
                'checkout_field_order' => 'recipient,national_id,state,city,postcode,phone,address,coupon,note',
                'product_faq_tab' => true,
                'product_spec_tab' => true,
                'wishlist_enabled' => true,
                'order_tracking_enabled' => true,
            ],
            'archive' => [
                'sidebar_enabled' => true,
                'category_slider' => true,
                'product_columns' => 3,
                'products_per_page' => 12,
                'default_sort' => 'newest',
                'filters_open_default' => false,
            ],
            'home' => [
                'stories_from_products' => false,
                'stories_count' => 14,
                'amazing_limit' => 10,
                'promo_limit' => 3,
                'icon_categories_limit' => 6,
                'brands_limit' => 12,
                'blog_limit' => 5,
                'taste_groups' => 3,
            ],
            'texts' => [
                'header' => [
                    'mega_empty' => 'هنوز دسته‌بندی ثبت نشده است.',
                    'mega_no_children' => 'زیردسته‌ای برای این گروه ثبت نشده است.',
                    'mega_all_prefix' => 'همه محصولات',
                    'loading' => 'در حال بارگذاری…',
                    'minicart_empty' => 'هیچ محصولی در سبد خرید نیست.',
                    'minicart_remove' => 'حذف',
                    'minicart_subtotal' => 'جمع جزء',
                    'minicart_view' => 'مشاهده سبد',
                    'minicart_checkout' => 'تسویه حساب',
                    'cart_label' => 'سبد خرید',
                    'account_login' => 'ورود و عضویت',
                    'account_tracking' => 'پیگیری سفارش',
                    'account_orders' => 'سفارش‌ها',
                    'account_wishlist' => 'علاقه‌مندی',
                    'account_addresses' => 'آدرس‌ها',
                    'account_profile' => 'پروفایل',
                    'account_logout' => 'خروج',
                    'search_popular_title' => 'جستجوهای پرتکرار',
                    'search_recent_title' => 'آخرین جستجوهای شما',
                    'search_none' => 'موردی وجود ندارد',
                    'search_no_result' => 'نتیجه‌ای یافت نشد',
                    'search_view_all' => 'مشاهده همه نتایج',
                    'drawer_categories' => 'دسته بندی محصولات',
                ],
                'home' => [
                    'cta_view_products' => 'مشاهده محصولات',
                    'remaining_label' => 'عدد باقی‌مانده',
                    'taste_subtitle' => 'بر اساس دسته‌های محبوب فروشگاه',
                    'more_label' => 'بیشتر',
                    'special_title' => 'پیشنهادهای ویژه امروز',
                    'best_sellers_title' => 'پرفروش‌ترین محصولات',
                    'amazing_title' => 'پیشنهاد شگفت‌انگیز',
                    'view_all' => 'مشاهده همه',
                    'view_all_products' => 'مشاهده همه محصولات',
                    'brands_title' => 'برندهای محبوب',
                    'items_suffix' => 'کالا',
                    'blog_title' => 'مجله',
                    'blog_view_all' => 'مشاهده همه مقالات',
                    'recent_title' => 'بازدیدهای اخیر شما',
                    'taste_title' => 'پیشنهاد برای سلیقه شما',
                    'story_view_product' => 'مشاهده محصول',
                    'badge_sale' => 'تخفیف',
                    'badge_new' => 'جدید',
                ],
                'product' => [
                    'not_found' => 'محصولی پیدا نشد.',
                    'new_badge' => 'جدید',
                    'rating_label' => 'امتیاز و دیدگاه',
                    'stats_label' => 'نمایش تشویقی',
                    'select_model' => 'انتخاب مدل',
                    'features_title' => 'مشاهده ویژگی‌های محصول',
                    'desc_open' => 'مشاهده توضیحات محصول',
                    'desc_close' => 'بستن توضیحات',
                    'return_notice' => 'امکان برگشت کالا در گروه آرایشی و بهداشتی با دلیل «انصراف از خرید» تنها در صورتی مورد قبول است که پلمب کالا باز نشده باشد.',
                    'guarantee_text' => '۷ روز ضمانت بازگشت بی قید و شرط',
                    'in_stock' => 'موجود در انبار',
                    'out_of_stock' => 'ناموجود',
                    'tab_desc' => 'توضیحات',
                    'tab_spec' => 'توضیحات تکمیلی',
                    'tab_faq' => 'پرسش‌ها',
                    'tab_reviews' => 'نظرات',
                    'faq_empty' => 'هنوز پرسشی ثبت نشده است.',
                    'reviews_title' => 'نقد و بررسی',
                    'installment_guide' => 'راهنمای خرید اقساطی',
                    'add_to_cart' => 'افزودن به سبد خرید',
                ],
                'card' => [
                    'new_badge' => 'جدید',
                    'out_of_stock' => 'ناموجود',
                    'in_stock' => 'موجود در انبار',
                    'view_product' => 'مشاهده محصول',
                ],
                'cart' => [
                    'back_title' => 'بازگشت به فروشگاه',
                    'back_subtitle' => 'شما داخل سبد خرید هستید',
                    'free_ship_title' => 'ارسال رایگان برای سفارشات',
                    'free_ship_done' => 'تبریک! ارسال این سفارش رایگان است.',
                    'empty_flash' => 'سبد خرید شما در حال حاضر خالی است.',
                    'empty_title' => 'سبد خرید شما خالیست',
                    'empty_text' => 'می‌توانید برای مشاهده محصولات بیشتر به صفحات زیر بروید',
                    'guest_note' => 'برای ثبت نهایی سفارش وارد حساب کاربری شوید؛ سبد شما حفظ می‌شود.',
                    'clear' => 'خالی کردن سبد',
                    'coupon_placeholder' => 'کد تخفیف را وارد نمایید',
                    'coupon_apply' => 'اعمال کد تخفیف',
                    'coupon_empty' => 'کد تخفیف را وارد کنید.',
                    'coupon_applied' => 'کد تخفیف اعمال شد.',
                    'coupon_invalid' => 'کد تخفیف معتبر نیست.',
                    'discount_label' => 'تخفیف',
                    'total_label' => 'جمع سبد خرید',
                    'login_card_title' => 'ورود به حساب کاربری',
                    'login_card_text' => 'جهت مشاهده محصولاتی که پیش‌تر به سبد خرید خود اضافه کرده‌اید وارد شوید.',
                    'deals_card_title' => 'پیشنهاد شگفت‌انگیز',
                ],
                'checkout' => [
                    'login_title' => 'ورود برای ادامه خرید',
                    'login_text' => 'برای ثبت سفارش و پرداخت، وارد حساب کاربری شوید. سبد خرید شما حفظ می‌شود.',
                    'login_button' => 'ورود و ادامه خرید',
                    'address_title' => 'اطلاعات تحویل‌گیرنده و آدرس',
                    'recipient_label' => 'نام و نام خانوادگی تحویل‌گیرنده',
                    'state_label' => 'استان',
                    'select_placeholder' => 'انتخاب کنید',
                    'city_label' => 'شهر',
                    'postcode_label' => 'کد پستی',
                    'phone_label' => 'موبایل',
                    'address_label' => 'آدرس کامل',
                    'coupon_label' => 'کد تخفیف',
                    'note_label' => 'یادداشت سفارش',
                    'shipping_title' => 'هزینه ارسال',
                    'shipping_quote' => 'محاسبه هزینه ارسال',
                    'shipping_hint' => 'پس از وارد کردن استان و کد پستی، هزینه را محاسبه کنید.',
                    'payment_title' => 'روش پرداخت',
                    'cash_tab' => 'پرداخت نقدی',
                    'installment_tab' => 'پرداخت اقساطی',
                    'gateway_ready' => 'آماده پرداخت امن',
                    'back_to_edit' => 'بازگشت به ویرایش اطلاعات',
                    'summary_title' => 'خلاصه سفارش',
                    'summary_empty' => 'سبد خرید خالی است.',
                    'payable_label' => 'مبلغ قابل پرداخت',
                    'assurance_1' => 'ضمانت بازگشت کالا',
                    'assurance_2' => 'ارسال سریع',
                    'assurance_3' => 'پرداخت امن',
                ],
                'pages' => [
                    'nf_title' => 'این صفحه پیدا نشد',
                    'nf_text' => 'نشانی را دوباره بررسی کنید یا به فروشگاه برگردید.',
                    'nf_home' => 'بازگشت به خانه',
                    'nf_shop' => 'مشاهده فروشگاه',
                    'track_title' => 'پیگیری سفارش',
                    'track_text' => 'شماره سفارش و موبایل یا ایمیل ثبت‌شده را وارد کنید.',
                    'track_number' => 'شماره سفارش',
                    'track_contact' => 'موبایل یا ایمیل',
                    'track_submit' => 'پیگیری',
                    'track_not_found' => 'سفارشی با این مشخصات پیدا نشد.',
                    'wishlist_title' => 'علاقه‌مندی‌ها',
                    'wishlist_empty' => 'هنوز محصولی به علاقه‌مندی‌ها اضافه نکرده‌اید.',
                    'login_title' => 'ورود یا ثبت‌نام',
                    'login_text' => 'برای ورود یا ثبت‌نام، شماره موبایل خود را وارد کنید.',
                ],
                'archive' => [
                    'sort_label' => 'مرتب‌سازی:',
                    'empty_title' => 'محصولی با این مشخصات پیدا نشد',
                    'empty_text' => 'فیلترها را تغییر دهید یا همه محصولات را ببینید.',
                    'view_all' => 'مشاهده همه محصولات',
                    'filters_title' => 'فیلترها',
                    'clear_filters' => 'حذف فیلترها',
                    'in_stock_only' => 'فقط کالاهای موجود',
                    'on_sale_only' => 'فقط کالاهای تخفیف‌دار',
                ],
                'blog' => [
                    'read_more' => 'ادامه مطلب',
                    'related' => 'مطالب مرتبط',
                    'toc' => 'فهرست مطالب',
                    'most_viewed' => 'پربازدیدترین',
                ],
                'footer' => [
                    'back_to_top' => 'برگشت به بالا',
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::MODULE, self::KEY, []);
        $merged = $this->deepMerge($this->defaults(), is_array($stored) ? $stored : []);

        return $this->syncLegacyFlags($merged);
    }

    /**
     * Public payload: full settings (no secrets). Colors + chrome toggles for storefront.
     *
     * @return array<string, mixed>
     */
    public function publicPayload(int $tenantId): array
    {
        return $this->get($tenantId);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $defaults = $this->defaults();
        $current = $this->get($tenantId);
        $sanitized = $this->sanitizeAgainstDefaults($input, $defaults);
        $merged = $this->deepMerge($current, $sanitized);
        $merged = $this->syncLegacyFlags($merged);
        $this->settings->put($tenantId, self::MODULE, self::KEY, $merged);
        $this->syncBrandingPalette($tenantId, $merged);

        return $this->get($tenantId);
    }

    /**
     * Keep site Style palette aligned so storefront CSS vars follow either panel.
     *
     * @param  array<string, mixed>  $appearance
     */
    private function syncBrandingPalette(int $tenantId, array $appearance): void
    {
        $tenant = Tenant::query()->find($tenantId);
        if (! $tenant) {
            return;
        }
        $map = [
            'primary' => $appearance['primary_color'] ?? null,
            'secondary' => $appearance['secondary_color'] ?? null,
            'accent' => $appearance['accent_color'] ?? null,
            'text' => $appearance['text1_color'] ?? null,
            'muted' => $appearance['text2_color'] ?? null,
            'text3' => $appearance['text3_color'] ?? null,
            'navy' => $appearance['navy_color'] ?? null,
            'surface' => $appearance['surface_color'] ?? null,
            'header' => $appearance['header_bg'] ?? null,
            'footer' => $appearance['footer_bg'] ?? null,
            'border' => $appearance['border_color'] ?? null,
        ];
        $palette = [];
        foreach ($map as $key => $value) {
            if (is_string($value) && $value !== '') {
                $palette[$key] = $value;
            }
        }
        if ($palette === []) {
            return;
        }
        $existing = is_array($tenant->branding) ? $tenant->branding : [];
        $existingPalette = is_array($existing['palette'] ?? null) ? $existing['palette'] : [];
        $tenant->branding = ThemeCatalog::mergeIntoExisting(
            $existing,
            ['palette' => array_merge($existingPalette, $palette)]
        );
        $tenant->save();
    }

    /**
     * Keep flat mega_menu / sticky_add_to_cart / show_installment_badge in sync with nested sections.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function syncLegacyFlags(array $data): array
    {
        if (isset($data['header']) && is_array($data['header'])) {
            if (array_key_exists('mega_menu', $data['header'])) {
                $data['mega_menu'] = (bool) $data['header']['mega_menu'];
            } elseif (array_key_exists('mega_menu', $data)) {
                $data['header']['mega_menu'] = (bool) $data['mega_menu'];
            }
        }
        if (isset($data['commerce']) && is_array($data['commerce'])) {
            if (array_key_exists('sticky_cart_mobile', $data['commerce'])) {
                $data['sticky_add_to_cart'] = (bool) $data['commerce']['sticky_cart_mobile'];
            }
            if (array_key_exists('card_installment_enabled', $data['commerce'])) {
                $data['show_installment_badge'] = (bool) $data['commerce']['card_installment_enabled'];
            }
            if (array_key_exists('gallery_thumbs', $data['commerce'])) {
                $data['pdp_gallery_style'] = (string) $data['commerce']['gallery_thumbs'];
            }
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    private function sanitizeAgainstDefaults(array $input, array $defaults): array
    {
        $out = [];
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (is_array($default)) {
                if (! is_array($value)) {
                    continue;
                }
                // List/repeater (numeric keys) — sanitize items loosely
                if ($default === [] || array_is_list($default)) {
                    $out[$key] = $this->sanitizeList($value, $key);
                    continue;
                }
                $out[$key] = $this->sanitizeAgainstDefaults($value, $default);
                continue;
            }
            if (is_bool($default)) {
                $out[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            } elseif (is_int($default)) {
                $out[$key] = (int) $value;
            } elseif (is_float($default)) {
                $out[$key] = (float) $value;
            } elseif ((str_ends_with($key, '_color') || str_ends_with($key, '_bg') || $key === 'banner_bg' || $key === 'banner_text_color') && is_string($value)) {
                $hex = $this->normalizeHex($value);
                if ($hex !== null) {
                    $out[$key] = $hex;
                }
            } else {
                $out[$key] = is_scalar($value) ? mb_substr(trim((string) $value), 0, $this->maxLen($key)) : $default;
            }
        }

        // Allow nested section keys present in input even when only partially sent
        foreach (['typography', 'general', 'header', 'footer', 'commerce', 'archive', 'home', 'texts'] as $section) {
            if (! isset($input[$section]) || ! is_array($input[$section]) || ! isset($defaults[$section])) {
                continue;
            }
            if (! isset($out[$section])) {
                $out[$section] = $this->sanitizeAgainstDefaults($input[$section], $defaults[$section]);
            }
        }

        return $out;
    }

    private function maxLen(string $key): int
    {
        if (str_contains($key, 'html') || str_contains($key, 'text') || str_contains($key, 'about') || str_contains($key, 'copyright') || str_contains($key, 'tagline')) {
            return 5000;
        }

        return 500;
    }

    /**
     * @param  list<mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function sanitizeList(array $value, string $key): array
    {
        $items = [];
        foreach (array_slice(array_values($value), 0, 40) as $row) {
            if (! is_array($row)) {
                continue;
            }
            $clean = [];
            foreach ($row as $k => $v) {
                if (! is_string($k)) {
                    continue;
                }
                if (is_array($v)) {
                    // nested links under footer_links
                    $nested = [];
                    foreach (array_slice(array_values($v), 0, 30) as $child) {
                        if (! is_array($child)) {
                            continue;
                        }
                        $nested[] = [
                            'label' => mb_substr(trim((string) ($child['label'] ?? '')), 0, 120),
                            'href' => mb_substr(trim((string) ($child['href'] ?? '')), 0, 500),
                        ];
                    }
                    $clean[$k] = $nested;
                } elseif (is_scalar($v)) {
                    $clean[$k] = mb_substr(trim((string) $v), 0, 500);
                }
            }
            if ($clean !== []) {
                $items[] = $clean;
            }
        }

        return $items;
    }

    private function normalizeHex(string $value): ?string
    {
        $v = trim($value);
        if (preg_match('/^#?[0-9a-fA-F]{6}$/', $v)) {
            return str_starts_with($v, '#') ? strtolower($v) : '#'.strtolower($v);
        }
        if (preg_match('/^#?[0-9a-fA-F]{3}$/', $v)) {
            $s = ltrim(strtolower($v), '#');

            return '#'.$s[0].$s[0].$s[1].$s[1].$s[2].$s[2];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $over
     * @return array<string, mixed>
     */
    private function deepMerge(array $base, array $over): array
    {
        foreach ($over as $key => $value) {
            if (is_array($value) && isset($base[$key]) && is_array($base[$key]) && ! array_is_list($base[$key]) && ! array_is_list($value)) {
                $base[$key] = $this->deepMerge($base[$key], $value);
            } else {
                $base[$key] = $value;
            }
        }

        return $base;
    }
}
