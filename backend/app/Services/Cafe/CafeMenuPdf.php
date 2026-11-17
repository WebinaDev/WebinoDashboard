<?php

namespace App\Services\Cafe;

use App\Models\Category;
use App\Models\Menu;
use App\Models\Product;
use App\Models\Tenant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\StoreCurrency;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Print-ready menu from the live catalog. Built for the public site (a table card or a QR
 * poster points at it) and for the dashboard download, so both print the same menu.
 *
 * The layout is deliberately print-first: category headings, dotted price leaders and an
 * optional allergen footer. Prices always come from the storefront price, never the raw
 * column, so a scheduled sale is what a guest sees on paper too.
 */
final class CafeMenuPdf
{
    public function __construct(
        private readonly ModuleSettingsService $settings,
        private readonly CafeOrdering $ordering,
    ) {}

    /**
     * @return array{html: string, filename: string}
     */
    public function render(Tenant $tenant, ?int $menuId, string $locale = 'fa', bool $withPrices = true): array
    {
        $tid = (int) $tenant->id;
        $menuSettings = $this->menuSettings($tid);
        $venue = $this->settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults());
        $hours = $this->settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());

        $menus = Menu::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->when($menuId, fn ($q) => $q->whereKey($menuId))
            ->orderBy('sort_order')
            ->get();

        $cats = Category::query()
            ->where('tenant_id', $tid)
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', 'publish'))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $products = Product::query()
            ->where('tenant_id', $tid)
            ->storefront()
            ->with('category')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        if ($menuId) {
            $products = $products->filter(fn (Product $p) => $p->menu_id === null || (int) $p->menu_id === (int) $menuId);
        }

        $currency = StoreCurrency::code($tid);
        $groups = $this->group($menus, $cats, $products, $locale, $currency, $withPrices);

        $html = view('pdf.cafe-menu-public', [
            'title' => (string) ($tenant->store_display_name ?: $tenant->name),
            'tagline' => $this->tagline($venue, $locale),
            'generated_at' => Carbon::now()->format('Y-m-d'),
            'hours_line' => $this->hoursLine($hours, $locale),
            'address' => $locale === 'fa' ? ($venue['address_fa'] ?? null) : ($venue['address_en'] ?? $venue['address_fa'] ?? null),
            'groups' => $groups,
            'menu_url' => $venue['map_url'] ?? null,
            'allergen_note' => (string) (($locale === 'fa' ? $menuSettings['allergen_note_fa'] : $menuSettings['allergen_note_en']) ?: ''),
        ])->render();

        $slug = $menuId ? 'menu-'.$menuId : 'cafe-menu';

        return ['html' => $html, 'filename' => $slug.'.pdf'];
    }

    /** @return array<string, mixed> */
    private function menuSettings(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());

        return array_merge(ModuleSettingsService::cafeMenuDefaults(), is_array($stored) ? $stored : []);
    }

    /**
     * @param  Collection<int, Menu>  $menus
     * @param  Collection<int, Category>  $cats
     * @param  Collection<int, Product>  $products
     * @return Collection<int, array<string, mixed>>
     */
    private function group($menus, $cats, $products, string $locale, string $currency, bool $withPrices)
    {
        $menuNames = $menus->mapWithKeys(fn (Menu $m) => [$m->id => (string) $m->name]);
        $buckets = [];

        foreach ($products as $product) {
            $menuKey = $product->menu_id && $menuNames->has((int) $product->menu_id) ? (int) $product->menu_id : 0;
            $menuName = $menuKey ? (string) $menuNames->get($menuKey) : '';
            $catKey = (string) ($product->category?->id ?? '0');
            $catName = (string) ($product->category?->name ?? '');
            $buckets[$menuKey][$catKey]['name'] = $catName;
            $buckets[$menuKey][$catKey]['items'][] = $this->item($product, $locale, $currency, $withPrices);
        }

        // Category order follows the dashboard's sort_order, with uncategorised items last.
        $catOrder = $cats->map(fn (Category $c) => (string) $c->name)->values()->all();
        $out = collect();
        foreach ($buckets as $menuKey => $categories) {
            $rows = collect($categories)
                ->map(fn (array $row) => [
                    'name' => $row['name'] !== '' ? $row['name'] : ($locale === 'fa' ? 'سایر' : 'Other'),
                    'items' => $row['items'],
                ])
                ->sortBy(function (array $row) use ($catOrder) {
                    $index = array_search($row['name'], $catOrder, true);

                    return $index === false ? PHP_INT_MAX : $index;
                })
                ->values()
                ->all();

            $out->push([
                'name' => $menuKey === 0 ? '' : (string) ($menuNames->get($menuKey) ?? ''),
                'categories' => $rows,
            ]);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function item(Product $product, string $locale, string $currency, bool $withPrices): array
    {
        $price = $product->storefrontPriceMinor();
        $regular = (int) $product->price_minor;
        $off = $regular > 0 && $price < $regular ? (int) round((1 - $price / $regular) * 100) : 0;

        $tags = [];
        if ($product->is_new) {
            $tags[] = $locale === 'fa' ? 'جدید' : 'New';
        }
        if ($product->is_featured) {
            $tags[] = $locale === 'fa' ? 'ویژه' : 'Signature';
        }
        if ((int) $product->spice_level > 0) {
            $tags[] = str_repeat('🌶', min(3, (int) $product->spice_level));
        }
        if ($product->calories) {
            $tags[] = $product->calories.' ' . ($locale === 'fa' ? 'کالری' : 'kcal');
        }

        return [
            'name' => (string) $product->name,
            'price' => $withPrices ? self::price($price, $currency, $locale) : '',
            'off' => $withPrices ? $off : 0,
            'tags' => trim(implode(' · ', array_filter($tags))),
            'featured' => (bool) $product->is_featured,
            'sold_out' => (bool) $product->is_sold_out,
        ];
    }

    /** @param  array<string, mixed>  $venue */
    private function tagline(array $venue, string $locale): ?string
    {
        $value = $locale === 'fa' ? ($venue['tagline_fa'] ?? null) : ($venue['tagline_en'] ?? $venue['tagline_fa'] ?? null);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /** @param  array<string, mixed>  $hours */
    private function hoursLine(array $hours, string $locale): ?string
    {
        $days = is_array($hours['days'] ?? null) ? $hours['days'] : [];
        $ranges = [];
        foreach ($days as $day) {
            if (! is_array($day) || ! empty($day['closed'])) {
                continue;
            }
            $open = (string) ($day['open'] ?? '');
            $close = (string) ($day['close'] ?? '');
            if ($open !== '' && $close !== '') {
                $ranges[trim($open.'-'.$close)] = true;
            }
        }
        if ($ranges === []) {
            return null;
        }
        $keys = array_keys($ranges);
        sort($keys);

        return ($locale === 'fa' ? 'ساعت کار: ' : 'Hours: ').implode(' / ', $keys);
    }

    /**
     * Print price: Persian digits and «تومان» for fa, grouped Latin digits otherwise. Money is
     * handled in minor units everywhere else, so the division happens only here.
     */
    public static function price(int $minor, string $currency, string $locale): string
    {
        $amount = (int) round($minor / 10);
        $label = strtoupper($currency) === 'IRR' || $locale === 'fa' ? ($locale === 'fa' ? 'تومان' : 'Toman') : $currency;
        if ($locale === 'fa') {
            $digits = strtr(number_format($amount), ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']);

            return $digits.' '.$label;
        }

        return number_format($amount).' '.$label;
    }
}
