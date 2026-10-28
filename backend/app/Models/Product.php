<?php

namespace App\Models;

use App\Services\Media\ImageSizes;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    protected $fillable = [
        'tenant_id',
        'vendor_store_id',
        'category_id',
        'menu_id',
        'name',
        'slug',
        'description',
        'short_description',
        'image_url',
        'cover_image_url',
        'video_url',
        'video_cover_url',
        'sku',
        'price_minor',
        'sale_price_minor',
        'price_updated_at',
        'sale_starts_at',
        'sale_ends_at',
        'currency',
        'stock',
        'is_available',
        'is_hidden',
        'is_new',
        'is_featured',
        'is_sold_out',
        'vat_applicable',
        'calories',
        'spice_level',
        'sort_order',
        'discount_percent',
        'meta',
        'status',
        'type',
        'catalog_visibility',
        'stock_status',
        'manage_stock',
        'backorders',
        'weight',
        'length',
        'width',
        'height',
        'gallery',
        'english_name',
        'shipping_time',
        'labels',
        'custom_labels',
        'initial_stock_quantity',
        'ai_review_summary',
        'faqs',
        'purchase_price_minor',
        'lock_price',
        'reference_url',
        'reference_source',
        'reference_last_sync',
        'wholesale_rule',
        'platform_prices',
        'views_count',
        'related_ids',
        'upsell_ids',
        'cross_sell_ids',
    ];

    /** ~800px WebP card size of the cover image (srcset for listings); null when not generated. */
    protected $appends = ['image_card_url'];

    public function getImageCardUrlAttribute(): ?string
    {
        $cover = $this->cover_image_url ?: $this->image_url;

        // Images ≤ 800px get no -800w sibling: the cover itself is the card image.
        return ImageSizes::cardUrlFor($cover) ?? ($cover ?: null);
    }

    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'sale_price_minor' => 'integer',
            'sale_starts_at' => 'datetime',
            'sale_ends_at' => 'datetime',
            'price_updated_at' => 'datetime',
            'purchase_price_minor' => 'integer',
            'stock' => 'integer',
            'is_available' => 'boolean',
            'is_hidden' => 'boolean',
            'is_new' => 'boolean',
            'is_featured' => 'boolean',
            'is_sold_out' => 'boolean',
            'vat_applicable' => 'boolean',
            'manage_stock' => 'boolean',
            'lock_price' => 'boolean',
            'calories' => 'integer',
            'spice_level' => 'integer',
            'sort_order' => 'integer',
            'discount_percent' => 'integer',
            'shipping_time' => 'integer',
            'initial_stock_quantity' => 'integer',
            'views_count' => 'integer',
            'meta' => 'array',
            'gallery' => 'array',
            'labels' => 'array',
            'custom_labels' => 'array',
            'faqs' => 'array',
            'wholesale_rule' => 'array',
            'platform_prices' => 'array',
            'related_ids' => 'array',
            'upsell_ids' => 'array',
            'cross_sell_ids' => 'array',
            'reference_last_sync' => 'datetime',
            'weight' => 'float',
            'length' => 'float',
            'width' => 'float',
            'height' => 'float',
        ];
    }

    public function isSaleWindowOpen(?CarbonInterface $at = null): bool
    {
        $at ??= now();
        if ($this->sale_starts_at && $this->sale_starts_at->greaterThan($at)) {
            return false;
        }

        return ! ($this->sale_ends_at && $this->sale_ends_at->lessThanOrEqualTo($at));
    }

    public function regularPriceMinor(?ProductVariant $variant = null): int
    {
        return (int) ($variant?->price_minor ?: $this->price_minor);
    }

    public function effectiveSalePriceMinor(?ProductVariant $variant = null, ?CarbonInterface $at = null): ?int
    {
        $sale = (int) (($variant ?? $this)->sale_price_minor ?? 0);
        $regular = $this->regularPriceMinor($variant);
        if ($sale <= 0 || ($regular > 0 && $sale >= $regular) || ! $this->isSaleWindowOpen($at)) {
            return null;
        }

        return $sale;
    }

    public function isOnSale(?ProductVariant $variant = null, ?CarbonInterface $at = null): bool
    {
        return $this->effectiveSalePriceMinor($variant, $at) !== null;
    }

    public function effectivePriceMinor(?ProductVariant $variant = null, ?CarbonInterface $at = null): int
    {
        return $this->effectiveSalePriceMinor($variant, $at) ?? $this->regularPriceMinor($variant);
    }

    /**
     * Customer-facing unit price: sale window, otherwise a percent discount off the regular price.
     */
    public function storefrontPriceMinor(?ProductVariant $variant = null, ?CarbonInterface $at = null): int
    {
        if ($this->isOnSale($variant, $at)) {
            return $this->effectivePriceMinor($variant, $at);
        }
        $regular = $this->regularPriceMinor($variant);
        $percent = (int) $this->discount_percent;
        if ($percent > 0 && $percent < 100) {
            return (int) round($regular * (100 - $percent) / 100);
        }

        return $regular;
    }

    public function scopeStorefront(Builder $query): Builder
    {
        return $query
            ->where('status', 'publish')
            ->where('is_hidden', false)
            ->where('is_available', true)
            ->where(function (Builder $q) {
                $q->where('is_sold_out', false)->orWhereNull('is_sold_out');
            });
    }

    /**
     * Storefront listing: like storefront(), but optionally keeps published products that are
     * unavailable only because they are out of stock (shown with a «ناموجود» badge, not buyable;
     * cart/checkout still check is_sold_out themselves).
     */
    /**
     * Public lookup key: exact slug, WooCommerce-style percent-encoded slug, or numeric id
     * (catalog list items expose `id`, and SSR/legacy links pass it). Slug matches win.
     */
    public function scopePublicKey(Builder $query, string $key): Builder
    {
        $key = trim(rawurldecode($key));
        $encoded = strtolower(rawurlencode($key));
        $isId = ctype_digit($key) && strlen($key) < 19;
        $query->where(function (Builder $q) use ($key, $encoded, $isId) {
            $q->where('slug', $key);
            if ($encoded !== $key) {
                $q->orWhere('slug', $encoded);
            }
            if ($isId) {
                $q->orWhere('id', (int) $key);
            }
        });
        if ($isId) {
            $query->orderByRaw('CASE WHEN slug = ? THEN 0 ELSE 1 END', [$key]);
        }

        return $query;
    }

    public function scopeCatalogListing(Builder $query, bool $includeOutOfStock = false): Builder
    {
        if (! $includeOutOfStock) {
            return $query->storefront();
        }

        return $query
            ->where('status', 'publish')
            ->where('is_hidden', false)
            ->where(function (Builder $q) {
                $q->where(function (Builder $in) {
                    $in->where('is_available', true)->where(fn (Builder $s) => $s->where('is_sold_out', false)->orWhereNull('is_sold_out'));
                })->orWhere('is_sold_out', true)->orWhere('stock_status', 'outofstock');
            });
    }

    /** Order in-stock products before out-of-stock ones (keeps the existing order inside each group). */
    public function scopeInStockFirst(Builder $query): Builder
    {
        $base = $query->getQuery();
        $orders = $base->orders ?? [];
        $base->orders = null;
        // No bindings: earlier ORDER BY subqueries own the 'order' binding slots.
        $query->orderByRaw("CASE WHEN is_sold_out = TRUE OR stock_status = 'outofstock' THEN 1 ELSE 0 END");
        $base->orders = array_merge($base->orders ?? [], $orders);

        return $query;
    }

    public function scopeSaleWindowOpen(Builder $query): Builder
    {
        $now = now();

        return $query
            ->where(fn (Builder $q) => $q->whereNull('sale_starts_at')->orWhere('sale_starts_at', '<=', $now))
            ->where(fn (Builder $q) => $q->whereNull('sale_ends_at')->orWhere('sale_ends_at', '>', $now));
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'category_product');
    }

    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class, 'brand_product');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(ProductTag::class, 'product_tag');
    }

    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(ProductAttribute::class, 'product_attribute_product')
            ->withPivot(['is_visible', 'is_variation', 'position', 'term_ids', 'custom_options']);
    }

    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort_order');
    }

    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('sort_order');
    }

    public function allergens(): BelongsToMany
    {
        return $this->belongsToMany(Allergen::class, 'product_allergen');
    }

    public function modifiers(): HasMany
    {
        return $this->hasMany(ProductModifier::class)->orderBy('sort_order');
    }

    public function likes(): HasMany
    {
        return $this->hasMany(ProductLike::class);
    }

    public function downloads(): HasMany
    {
        return $this->hasMany(ProductDownload::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(ProductReview::class);
    }

    public function marketplaceMaps(): HasMany
    {
        return $this->hasMany(MarketplaceProductMap::class);
    }

    public function coffeeProfile(): HasOne
    {
        return $this->hasOne(CoffeeProfile::class);
    }
}
