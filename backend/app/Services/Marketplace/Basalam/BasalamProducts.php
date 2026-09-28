<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\MarketplaceProductMap;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\FeedCatalog;
use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplacePricing;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Throwable;

/**
 * Basalam product engine (port of ProductDataFacade/Builder, the create/update/quick/custom strategies,
 * Create/Update/Archive/Restore operations, Connect/AutoConnect, ProductConnection and the bulk jobs).
 *
 * Every variant of a variable product is its own Basalam product ("standalone"): simple products get a
 * product-level map, variants get variant maps whose remote_product_id is their own Basalam id.
 */
class BasalamProducts
{
    public const JOB_CREATE_SINGLE = 'sync_basalam_create_single_product';

    public const JOB_UPDATE_SINGLE = 'sync_basalam_update_single_product';

    public const JOB_CREATE_ALL = 'sync_basalam_create_all_products';

    public const JOB_UPDATE_ALL = 'sync_basalam_update_all_products';

    public const JOB_BULK_UPDATE = 'sync_basalam_bulk_update_products';

    public const JOB_AUTO_CONNECT = 'sync_basalam_auto_connect_products';

    public const JOB_ARCHIVE = 'sync_basalam_archive_product';

    public const JOB_RESTORE = 'sync_basalam_restore_product';

    /** WordPress job priorities (lower runs first). */
    public const PRIORITIES = [
        self::JOB_BULK_UPDATE => 1,
        self::JOB_UPDATE_ALL => 2,
        self::JOB_UPDATE_SINGLE => 3,
        self::JOB_CREATE_SINGLE => 4,
        self::JOB_CREATE_ALL => 5,
        self::JOB_AUTO_CONNECT => 6,
        self::JOB_ARCHIVE => 3,
        self::JOB_RESTORE => 3,
    ];

    public const STATUS_ACTIVE = 2976;

    public const STATUS_ARCHIVED = 3790;

    public const DEFAULT_UNIT_TYPE = 6304;

    public const BULK_INTERVAL = 12;

    /** Mobile / gold attribute ids (MobileDataHandler, GoldDataHandler). */
    public const MOBILE_ATTRS = ['storage' => 1707, 'cpu_type' => 1708, 'ram' => 1709, 'screen_size' => 1710, 'rear_camera' => 1711, 'battery_capacity' => 1712];

    public const GOLD_ATTRS = ['purity' => 1785, 'weight' => 1786];

    public const MAX_DESCRIPTION_RETRIES = 3;

    protected ?array $engineCache = null;

    protected ?FeedCatalog $catalog = null;

    protected ?MarketplacePricing $pricing = null;

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    /** @return array<string, mixed> */
    public function engine(): array
    {
        return $this->engineCache ??= (new BasalamSettings($this->settings()))->engine($this->tid());
    }

    public function categories(): BasalamCategories
    {
        return new BasalamCategories($this->client);
    }

    public function media(): BasalamMedia
    {
        return new BasalamMedia($this->client);
    }

    public function commission(): BasalamCommission
    {
        return new BasalamCommission($this->client);
    }

    protected function catalog(): FeedCatalog
    {
        return $this->catalog ??= FeedCatalog::for($this->tid());
    }

    protected function pricing(): MarketplacePricing
    {
        return $this->pricing ??= MarketplacePricing::forTenant($this->tid());
    }

    protected function sync(): MarketplaceSync
    {
        return app(MarketplaceSync::class);
    }

    /** @return array<string, mixed> Per-product Basalam fields (unit, wholesale, mobile/gold, video, price change…). */
    public static function productMeta(Product $product): array
    {
        return (array) data_get($product->meta, 'marketplace.basalam', []);
    }

    // ── Maps ────────────────────────────────────────────────────────────

    /** @return Collection<int, MarketplaceProductMap> */
    public function maps(Product $product): Collection
    {
        return MarketplaceProductMap::query()->with('variant')->where('tenant_id', $this->tid())
            ->where('product_id', $product->id)->where('platform', 'basalam')->whereNotNull('remote_product_id')->get();
    }

    public function mapFor(Product $product, ?ProductVariant $variant = null): ?MarketplaceProductMap
    {
        return MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('product_id', $product->id)
            ->where('variant_key', (int) ($variant?->id ?? 0))->where('platform', 'basalam')->whereNotNull('remote_product_id')->first();
    }

    public function isVariable(Product $product): bool
    {
        return $product->type === 'variable' || $product->variants()->exists();
    }

    /** @return Collection<int, ProductVariant> */
    protected function variantsOf(Product $product): Collection
    {
        return $product->variants()->get();
    }

    protected function storeMap(Product $product, ?ProductVariant $variant, string $remoteId, int $status = self::STATUS_ACTIVE): MarketplaceProductMap
    {
        return MarketplaceProductMap::query()->updateOrCreate(
            ['product_id' => $product->id, 'variant_key' => (int) ($variant?->id ?? 0), 'platform' => 'basalam'],
            [
                'tenant_id' => $this->tid(),
                'product_variant_id' => $variant?->id,
                'remote_product_id' => $remoteId,
                'remote_variant_id' => null,
                'remote_url' => 'https://basalam.com/p/'.$remoteId,
                'sync_enabled' => true,
                'last_sync_at' => now(),
                'last_error' => null,
                'meta' => array_filter(['standalone' => $variant ? true : null, 'status' => $status, 'sync_status' => 'synced']),
            ]
        );
    }

    // ── Payload pieces ──────────────────────────────────────────────────

    public static function htmlToText(?string $html): string
    {
        $html = (string) $html;
        if ($html === '') {
            return '';
        }
        $html = preg_replace('#<\s*br\s*/?>#i', "\n", $html) ?? $html;
        $html = preg_replace('#</\s*(p|div|li|h[1-6]|tr)\s*>#i', "\n", $html) ?? $html;
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/[ \t\x{00a0}]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/ *\n */u', "\n", $text) ?? $text;
        $text = preg_replace('/\n{3,}/u', "\n\n", $text) ?? $text;

        return trim($text);
    }

    /** @return array<string, string> attribute label => value */
    public function attributeList(Product $product): array
    {
        return $this->catalog()->spec($product);
    }

    /** @return list<string> Display values of a variant's attributes. */
    public static function variantValues(ProductVariant $variant): array
    {
        $out = [];
        foreach ((array) ($variant->attribute_values ?? []) as $av) {
            $value = is_array($av) ? (string) ($av['term_name'] ?? $av['value'] ?? '') : (string) $av;
            $value = trim(str_replace('-', ' ', $value));
            if ($value !== '') {
                $out[] = $value;
            }
        }
        if ($out === [] && filled($variant->name)) {
            $out = array_values(array_filter(array_map('trim', explode('/', (string) $variant->name))));
        }

        return $out;
    }

    public function name(Product $product, ?ProductVariant $variant = null): string
    {
        $engine = $this->engine();
        $base = (string) $product->name;
        if ($variant) {
            $parts = self::variantValues($variant);
            $base = $parts ? trim($base.' '.implode(' ', $parts)) : $base;
        }
        $name = ($engine['product_prefix_title'] ?? '') !== '' ? $engine['product_prefix_title'].' '.$base : $base;
        $name = ($engine['product_suffix_title'] ?? '') !== '' ? $name.' '.$engine['product_suffix_title'] : $name;
        if (! $variant && ! empty($engine['product_attribute_suffix_enabled'])) {
            $wanted = trim((string) ($engine['product_attribute_suffix_priority'] ?? ''));
            if ($wanted !== '') {
                foreach ($this->attributeList($product) as $label => $value) {
                    if (trim((string) $label) === $wanted && trim((string) $value) !== '') {
                        $name .= ' ('.$value.')';
                        break;
                    }
                }
            }
        }

        return mb_substr($name, 0, 120);
    }

    public function description(Product $product): string
    {
        $engine = $this->engine();
        $parts = [];
        if (! empty($engine['add_short_desc_to_desc_product'])) {
            $short = self::htmlToText($product->short_description);
            if ($short !== '') {
                $parts[] = $short;
            }
        }
        if (! empty($engine['add_full_desc_to_desc_product'])) {
            $full = self::htmlToText($product->description);
            if ($full !== '') {
                $parts[] = $full;
            }
        }
        if (! empty($engine['add_attr_to_desc_product'])) {
            $lines = [];
            foreach ($this->attributeList($product) as $label => $value) {
                if (trim((string) $label) !== '' && trim((string) $value) !== '') {
                    $lines[] = trim((string) $label).' : '.trim((string) $value);
                }
            }
            if ($lines) {
                $parts[] = implode("\n", $lines);
            }
        }

        return mb_substr(implode("\n\n", $parts), 0, 5000);
    }

    /** @return list<int> */
    public function categoryIds(Product $product): array
    {
        return $this->categories()->categoryIdsFor($product, $this->engine());
    }

    public function categoryId(Product $product): ?int
    {
        $ids = $this->categoryIds($product);

        return $ids ? (int) end($ids) : null;
    }

    /** Price change: variant override → product override → global (commission | ±% | toman). */
    public function priceChange(Product $product, ?ProductVariant $variant = null): string
    {
        $meta = self::productMeta($product);
        if ($variant) {
            $v = $meta['variant_price_change'][(string) $variant->id] ?? null;
            if ($v !== null && $v !== '') {
                return BasalamSettings::normalizePriceChange($v);
            }
        }
        $p = $meta['price_change'] ?? null;
        if ($p !== null && $p !== '') {
            return BasalamSettings::normalizePriceChange($p);
        }

        return (string) ($this->engine()['price_change_value'] ?? '0');
    }

    /**
     * Final Basalam price in rial (PriceService::calculateFinalPrice). A locked manual Basalam price
     * from the pricing hub wins as-is; `null` when the result is below 1000 rial.
     */
    public function price(Product $product, ?ProductVariant $variant = null): ?int
    {
        $manual = $this->pricing()->manualPrice($product, $variant, 'basalam');
        if ($manual) {
            $rial = (int) round($this->pricing()->toRial($manual['price'], $product->currency ?: null));

            return $rial >= 1000 ? $rial : null;
        }
        $src = $variant ?? $product;
        $regular = (float) ($src->price_minor ?: $product->price_minor ?: 0);
        $sale = (float) ($product->effectiveSalePriceMinor($variant) ?? 0);
        $field = $this->engine()['product_price_field'] ?? 'original_price';
        $base = $field === 'sale_price' && $sale > 0 ? $sale : $regular;
        if ($base <= 0) {
            return null;
        }
        $price = $this->pricing()->toRial($base, $product->currency ?: null);
        $change = $this->priceChange($product, $variant);
        if ($change !== '' && $change !== '0') {
            if (BasalamSettings::isCommission($change)) {
                $price = $this->commission()->applyTo($price, $this->categoryIds($product));
            } elseif (BasalamSettings::isPercentChange($change)) {
                $price += $price * ((int) $change / 100);
            } else {
                $price += (int) $change * 10;
            }
        }
        $round = $this->engine()['round_price'] ?? 'none';
        if ($round === 'up') {
            $price = ceil($price / 10000) * 10000;
        } elseif ($round === 'down') {
            $price = floor($price / 10000) * 10000;
        }

        return $price < 1000 ? null : (int) $price;
    }

    /** @return array{0: ?int, 1: string} [quantity or null when stock is not managed, stock status] */
    protected static function stockState(Product|ProductVariant $src, ?Product $parent = null): array
    {
        $manage = $src instanceof ProductVariant ? (bool) ($src->manage_stock ?? false) : (bool) $src->manage_stock;
        $status = (string) ($src->stock_status ?: ($src instanceof ProductVariant ? '' : 'instock'));
        if ($status === '' && $parent) {
            $status = (string) ($parent->stock_status ?: 'instock');
        }
        $status = $status ?: 'instock';
        if ($manage) {
            $qty = max(0, (int) ($src->stock ?? 0));
            if ($qty <= 0) {
                $status = 'outofstock';
            }

            return [$qty, $status];
        }

        return [null, $status];
    }

    public function stock(Product $product, ?ProductVariant $variant = null): int
    {
        $engine = $this->engine();
        $default = (int) ($engine['default_stock_quantity'] ?? 1);
        $safe = (int) ($engine['safe_stock'] ?? 0);
        if ($variant) {
            $preferProduct = ($engine['variable_product_stock_source'] ?? 'variation') === 'product';
            [$qty, $status] = $preferProduct ? self::stockState($product) : self::stockState($variant, $product);
            if ($qty === null && $status === 'instock') {
                [$fQty, $fStatus] = $preferProduct ? self::stockState($variant, $product) : self::stockState($product);
                if ($fQty !== null || $fStatus !== 'instock') {
                    [$qty, $status] = [$fQty, $fStatus];
                }
            }
        } else {
            [$qty, $status] = self::stockState($product);
        }
        $stock = $status === 'instock' ? ($qty ?? $default) : 0;
        if ($safe > 0 && $stock <= $safe) {
            return 0;
        }

        return $stock;
    }

    /** Grams; variant → product → default_weight. */
    public function weight(Product $product, ?ProductVariant $variant = null): int
    {
        $raw = (float) ($variant?->weight ?: $product->weight ?: 0);
        if ($raw <= 0) {
            return (int) ($this->engine()['default_weight'] ?? 0);
        }

        return (int) round($raw);
    }

    public function packageWeight(Product $product, ?ProductVariant $variant = null): int
    {
        return $this->weight($product, $variant) + (int) ($this->engine()['default_package_weight'] ?? 0);
    }

    /** Default preparation days capped to (or rejected by) the category maximum (PreparationDaysGuard). */
    public function preparationDays(Product $product): int
    {
        $meta = self::productMeta($product);
        $days = isset($meta['preparation_days']) && is_numeric($meta['preparation_days']) && (int) $meta['preparation_days'] > 0
            ? (int) $meta['preparation_days']
            : (int) ($this->engine()['default_preparation'] ?? 1);
        $categoryId = $this->categoryId($product);
        $max = $categoryId ? $this->categories()->maxPreparationDays($categoryId) : null;
        if ($max === null || $days <= $max) {
            return $days;
        }
        if (! empty($this->engine()['cap_preparation_to_category_max'])) {
            return $max;
        }
        throw new MarketplaceException(__('marketplace.basalam_preparation_exceeded', ['days' => $days, 'max' => $max]), 422);
    }

    public function unitType(Product $product): int
    {
        $v = self::productMeta($product)['unit_type'] ?? null;

        return is_numeric($v) && (int) $v > 0 ? (int) $v : self::DEFAULT_UNIT_TYPE;
    }

    public function unitQuantity(Product $product): int
    {
        $v = self::productMeta($product)['unit_quantity'] ?? null;

        return is_numeric($v) && (int) $v > 0 ? (int) $v : 1;
    }

    public function isWholesale(Product $product): bool
    {
        return ($this->engine()['all_products_wholesale'] ?? 'none') === 'all' || ! empty(self::productMeta($product)['is_wholesale']);
    }

    protected function mainPhotoUrl(Product $product, ?ProductVariant $variant = null): ?string
    {
        foreach ([$variant?->image_url, $product->image_url, $product->cover_image_url] as $u) {
            if (is_string($u) && $u !== '') {
                return $this->catalog()->absoluteUrl($u);
            }
        }

        return null;
    }

    public function mainPhoto(Product $product, ?ProductVariant $variant = null): ?int
    {
        $url = $this->mainPhotoUrl($product, $variant);

        return $url ? $this->media()->photoId($url) : null;
    }

    /** @return list<int> Up to 20 gallery photos (main image excluded). */
    public function gallery(Product $product): array
    {
        $main = $this->mainPhotoUrl($product);
        $urls = array_values(array_filter($this->catalog()->images($product), fn ($u) => $u !== $main));
        $ids = [];
        foreach (array_slice($urls, 0, 20) as $url) {
            $id = $this->media()->photoId($url);
            if ($id) {
                $ids[] = $id;
            }
        }

        return $ids;
    }

    /** Video source: Basalam box (product meta) or inherited from the product (auto) / a meta key (manual). */
    public function videoUrl(Product $product): ?string
    {
        $engine = $this->engine();
        $meta = self::productMeta($product);
        if (($engine['video_source'] ?? 'plugin_box') === 'plugin_box') {
            $url = (string) ($meta['video_url'] ?? '');
        } elseif (($engine['video_inherit_mode'] ?? 'auto') === 'manual') {
            $key = trim((string) ($engine['video_meta_key'] ?? ''));
            $v = $key !== '' ? data_get($product->meta, $key) : null;
            $url = is_array($v) ? (string) reset($v) : (string) $v;
        } else {
            $url = (string) ($product->video_url ?: '');
            if ($url === '') {
                $url = (string) ($product->media->firstWhere('type', 'video')?->url ?? '');
            }
        }

        return $url !== '' ? $this->catalog()->absoluteUrl($url) : null;
    }

    public function video(Product $product): ?int
    {
        $url = $this->videoUrl($product);

        return $url ? $this->media()->videoId($url) : null;
    }

    /** @return list<array{attribute_id: int, value: string}> Mobile + gold + option-mapped attributes. */
    public function attributes(Product $product): array
    {
        $meta = self::productMeta($product);
        $out = [];
        if (! empty($meta['is_mobile'])) {
            foreach (self::MOBILE_ATTRS as $key => $id) {
                $out[] = ['attribute_id' => $id, 'value' => (string) ($meta['mobile'][$key] ?? '')];
            }
        }
        if (! empty($meta['is_gold'])) {
            foreach (self::GOLD_ATTRS as $key => $id) {
                $out[] = ['attribute_id' => $id, 'value' => (string) ($meta['gold'][$key] ?? '')];
            }
        }
        $local = $this->attributeList($product);
        $maps = $this->categories()->optionMapIndex();
        if ($local === [] || $maps === []) {
            return $out;
        }
        $categoryId = $this->categoryId($product);
        try {
            $defs = $categoryId ? $this->categories()->attributes($categoryId) : [];
        } catch (Throwable) {
            $defs = [];
        }
        foreach ($local as $label => $value) {
            $title = $maps[trim((string) $label)] ?? trim((string) $label);
            foreach ($defs as $def) {
                if (trim($def['title']) === $title) {
                    $out[] = ['attribute_id' => $def['id'], 'value' => (string) $value];
                    break;
                }
            }
        }

        return $out;
    }

    public function isUpdateSelectionValid(): bool
    {
        $engine = $this->engine();
        if (($engine['sync_product_fields'] ?? 'all') !== 'custom') {
            return true;
        }
        foreach (BasalamSettings::CUSTOM_UPDATE_FIELDS as $field) {
            if (! empty($engine[$field])) {
                return true;
            }
        }

        return false;
    }

    public function updateMode(): string
    {
        return match ($this->engine()['sync_product_fields'] ?? 'all') {
            'price_stock' => 'quick_update',
            'custom' => 'custom_update',
            default => 'update',
        };
    }

    protected function syncField(string $key): bool
    {
        return ! empty($this->engine()[$key]);
    }

    /**
     * Build a request body. Modes: create | update | quick_update | custom_update.
     *
     * @return array<string, mixed>
     */
    public function payload(Product $product, ?ProductVariant $variant, string $mode): array
    {
        if ($mode === 'quick_update') {
            return array_filter([
                'primary_price' => $this->price($product, $variant),
                'stock' => $this->stock($product, $variant),
            ], fn ($v) => $v !== null);
        }
        if ($mode === 'custom_update') {
            $data = [];
            if ($this->syncField('sync_product_field_name')) {
                $data['name'] = $this->name($product, $variant);
            }
            if ($this->syncField('sync_product_field_photos')) {
                $data['photo'] = $this->mainPhoto($product, $variant);
                $data['photos'] = $this->gallery($product);
            }
            if ($this->syncField('sync_product_field_video')) {
                $data['video'] = $this->video($product);
            }
            if ($this->syncField('sync_product_field_price') || ($variant && $this->syncField('sync_product_field_variant_price'))) {
                $data['primary_price'] = $this->price($product, $variant);
            }
            if ($this->syncField('sync_product_field_stock') || ($variant && $this->syncField('sync_product_field_variant_stock'))) {
                $data['stock'] = $this->stock($product, $variant);
            }
            if ($this->syncField('sync_product_field_weight')) {
                $data['weight'] = $this->weight($product, $variant);
                $data['package_weight'] = $this->packageWeight($product, $variant);
            }
            if ($this->syncField('sync_product_field_description')) {
                $data['description'] = $this->description($product);
            }
            if ($this->syncField('sync_product_field_attr')) {
                $data['product_attribute'] = $this->attributes($product);
            }

            return array_filter($data, fn ($v) => $v !== null);
        }

        $data = [
            'name' => $this->name($product, $variant),
            'description' => $this->description($product),
        ];
        if ($mode === 'create') {
            $data['category_id'] = $this->categoryId($product);
        }
        $data += [
            'weight' => $this->weight($product, $variant),
            'package_weight' => $this->packageWeight($product, $variant),
            'photo' => $this->mainPhoto($product, $variant),
            'photos' => $this->gallery($product),
            'video' => $this->video($product),
        ];
        if ($mode === 'create') {
            $data['status'] = self::STATUS_ACTIVE;
        }
        $data += [
            'preparation_days' => $this->preparationDays($product),
            'unit_type' => $this->unitType($product),
            'unit_quantity' => $this->unitQuantity($product),
            'is_wholesale' => $this->isWholesale($product),
            'variants' => [],
        ];
        if ($mode === 'create') {
            $data['product_attribute'] = $this->attributes($product);
        }
        $data['primary_price'] = $this->price($product, $variant);
        $data['stock'] = $this->stock($product, $variant);

        return array_filter($data, fn ($v) => $v !== null);
    }

    // ── Validation ──────────────────────────────────────────────────────

    protected function assertPublishable(Product $product, bool $requireImage): void
    {
        if ($product->status !== 'publish') {
            throw new MarketplaceException(__('marketplace.basalam_product_not_published', ['id' => $product->id]), 422);
        }
        if ($requireImage && ! $this->mainPhotoUrl($product)) {
            throw new MarketplaceException(__('marketplace.basalam_product_no_image'), 422);
        }
    }

    /** @param  array<string, mixed>  $payload */
    protected function assertCreatePayload(array $payload): void
    {
        if (! is_numeric($payload['category_id'] ?? null) || (int) $payload['category_id'] <= 0) {
            throw new MarketplaceException(__('marketplace.basalam_category_invalid'), 422);
        }
        if (! is_numeric($payload['photo'] ?? null) || (int) $payload['photo'] <= 0) {
            throw new MarketplaceException(__('marketplace.basalam_photo_missing'), 422);
        }
        if (! isset($payload['primary_price'])) {
            throw new MarketplaceException(__('marketplace.basalam_price_too_low'), 422);
        }
    }

    // ── Connection safety ───────────────────────────────────────────────

    /** Local products/variants other than this map that point at the same Basalam product. */
    public function conflictsFor(MarketplaceProductMap $map): array
    {
        return MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')
            ->where('remote_product_id', $map->remote_product_id)->where('id', '!=', $map->id)
            ->where('product_id', '!=', $map->product_id)
            ->pluck('product_id')->map(fn ($v) => (int) $v)->unique()->values()->all();
    }

    protected function assertUnique(MarketplaceProductMap $map): void
    {
        $others = $this->conflictsFor($map);
        if ($others === []) {
            return;
        }
        $this->reportConflict((int) $map->product_id, $others);
        throw new MarketplaceException(__('marketplace.basalam_duplicate_connection', [
            'ids' => implode('، ', $others), 'remote' => (string) $map->remote_product_id,
        ]), 409);
    }

    /** @return list<array{basalam_product_id: string, product_ids: list<int>}> */
    public function duplicateConnections(): array
    {
        return MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')
            ->whereNotNull('remote_product_id')->get(['product_id', 'remote_product_id'])
            ->groupBy('remote_product_id')
            ->map(fn ($g, $remote) => ['basalam_product_id' => (string) $remote, 'product_ids' => $g->pluck('product_id')->map(fn ($v) => (int) $v)->unique()->sort()->values()->all()])
            ->filter(fn ($row) => count($row['product_ids']) > 1)->values()->all();
    }

    /** Keep the oldest product on each shared Basalam id, disconnect the rest. */
    public function repairDuplicateConnections(): array
    {
        $repairs = [];
        foreach ($this->duplicateConnections() as $dup) {
            $ids = $dup['product_ids'];
            $kept = array_shift($ids);
            if (! $ids) {
                continue;
            }
            MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')
                ->where('remote_product_id', $dup['basalam_product_id'])->whereIn('product_id', $ids)->delete();
            MarketplaceLogger::warning($this->tid(), 'basalam', 'product', 'اتصال تکراری به یک محصول باسلام پیدا و اصلاح شد.', [
                'basalam_product_id' => $dup['basalam_product_id'], 'kept' => $kept, 'disconnected' => $ids,
            ]);
            $repairs[] = ['basalam_product_id' => $dup['basalam_product_id'], 'kept' => $kept, 'disconnected' => $ids];
            $this->recordReport('repaired', array_merge([$kept], $ids), $kept, $ids);
        }

        return $repairs;
    }

    protected function reportConflict(int $productId, array $others): void
    {
        $ids = array_values(array_unique(array_merge([$productId], $others)));
        sort($ids);
        if ($this->recordReport('conflict', $ids, 0, [])) {
            MarketplaceLogger::error($this->tid(), 'basalam', 'product', 'همگام‌سازی متوقف شد: اتصال این محصول با محصول دیگری مشترک است.', [
                'product_id' => $productId, 'conflicts' => $others,
            ]);
        }
    }

    /** Stores up to 50 duplicate-connection report items in state; false when already recorded. */
    protected function recordReport(string $type, array $ids, int $kept, array $disconnected): bool
    {
        $report = (array) ($this->settings()->state($this->tid(), 'basalam')['duplicate_report'] ?? []);
        $key = $type.':'.implode('-', $ids);
        if (isset($report[$key])) {
            return false;
        }
        if (count($report) >= 50) {
            array_shift($report);
        }
        $report[$key] = ['type' => $type, 'product_ids' => $ids, 'kept' => $kept, 'disconnected' => $disconnected, 'recorded_at' => now()->toIso8601String()];
        $this->settings()->putState($this->tid(), 'basalam', ['duplicate_report' => $report]);

        return true;
    }

    public function duplicateReport(): array
    {
        return array_values((array) ($this->settings()->state($this->tid(), 'basalam')['duplicate_report'] ?? []));
    }

    public function forgetDuplicateReport(): void
    {
        $this->settings()->putState($this->tid(), 'basalam', ['duplicate_report' => []]);
    }

    // ── Remote calls ────────────────────────────────────────────────────

    /** @return array{0: string, 1: string} [first message, first field] of a Basalam error body. */
    protected static function firstError(array $body): array
    {
        $message = (string) (data_get($body, 'messages.0.message') ?? data_get($body, '0.message') ?? '');
        $field = (string) (data_get($body, 'messages.0.fields.0') ?? data_get($body, '0.fields.0') ?? '');

        return [$message, $field];
    }

    /**
     * POST/PATCH with up to three retries that strip description words Basalam flagged.
     *
     * @param  array<string, mixed>  $payload
     * @return array<mixed>
     */
    protected function sendWithDescriptionRetry(string $method, string $url, array &$payload): array
    {
        $attempt = 0;
        while (true) {
            try {
                return $method === 'POST' ? $this->client->post($url, $payload) : $this->client->patch($url, $payload);
            } catch (MarketplaceException $e) {
                if ($e->isTransient() || $attempt >= self::MAX_DESCRIPTION_RETRIES || ! is_string($payload['description'] ?? null)) {
                    throw $e;
                }
                $values = BasalamDescriptionSanitizer::extract($e->response);
                if ($values === []) {
                    throw $e;
                }
                $clean = BasalamDescriptionSanitizer::sanitize($payload['description'], $values);
                if ($clean === $payload['description']) {
                    throw $e;
                }
                $payload['description'] = $clean;
                $attempt++;
            }
        }
    }

    /** @param  array<string, mixed>  $payload */
    public function createRemote(array $payload): string
    {
        $this->assertCreatePayload($payload);
        $vendor = $this->client->vendorId();
        $url = sprintf(BasalamEndpoints::PRODUCT_CREATE, $vendor);
        try {
            $res = $this->sendWithDescriptionRetry('POST', $url, $payload);
        } catch (MarketplaceException $e) {
            if ($e->isTransient()) {
                throw $e;
            }
            [$msg, $field] = self::firstError($e->response);
            $text = __('marketplace.basalam_create_failed', ['error' => $msg !== '' ? $msg : $e->getMessage()]);
            if ($field !== '') {
                $text .= ' ('.__('marketplace.basalam_field').': '.$field.')';
            }
            throw new MarketplaceException($text.' | vendor_id: '.$vendor, $e->status, $e->response, 0, $e->path);
        }
        $id = (string) ($res['id'] ?? data_get($res, 'data.id') ?? '');
        if ($id === '' || ($this->client->lastStatus && $this->client->lastStatus !== 201 && $this->client->lastStatus !== 200)) {
            [$msg, $field] = self::firstError($res);
            throw new MarketplaceException(__('marketplace.basalam_create_failed', ['error' => $msg !== '' ? $msg.($field ? ' ('.$field.')' : '') : __('marketplace.basalam_timeout')]), 502, $res);
        }

        return $id;
    }

    /** @param  array<string, mixed>  $payload */
    public function updateRemote(string $remoteId, array $payload): array
    {
        try {
            return $this->sendWithDescriptionRetry('PATCH', sprintf(BasalamEndpoints::PRODUCT_UPDATE, (int) $remoteId), $payload);
        } catch (MarketplaceException $e) {
            if ($e->status === 403) {
                throw new MarketplaceException(__('marketplace.basalam_not_owner'), 403, $e->response, 0, $e->path);
            }
            if ($e->isTransient()) {
                throw $e;
            }
            [$msg, $field] = self::firstError($e->response);
            $text = $msg !== '' ? $msg : $e->getMessage();
            if ($field !== '') {
                $text .= ' ('.__('marketplace.basalam_field').': '.$field.')';
            }
            throw new MarketplaceException($text, $e->status, $e->response, 0, $e->path);
        }
    }

    // ── Operations ──────────────────────────────────────────────────────

    /**
     * Create on Basalam. Variable products create one Basalam product per unmapped variant.
     *
     * @param  list<int>|null  $categoryIds
     * @return array<string, mixed>
     */
    public function create(Product $product, ?array $categoryIds = null, ?ProductVariant $only = null): array
    {
        $this->client->vendorId();
        $this->assertPublishable($product, ! $this->maps($product)->count());
        $this->applyCategoryOverride($product, $categoryIds);

        if ($this->isVariable($product)) {
            if ($this->mapFor($product)) {
                throw new MarketplaceException(__('marketplace.basalam_legacy_variable', ['id' => $product->id]), 422);
            }
            $created = 0;
            $skipped = 0;
            $pending = 0;
            $errors = [];
            $lastId = null;
            foreach ($this->variantsOf($product) as $variant) {
                if ($only && $only->id !== $variant->id) {
                    continue;
                }
                if ($this->mapFor($product, $variant)) {
                    $skipped++;

                    continue;
                }
                $pending++;
                try {
                    $payload = $this->payload($product, $variant, 'create');
                } catch (Throwable $e) {
                    $errors[] = sprintf('#%d [payload]: %s', $variant->id, $e->getMessage());

                    continue;
                }
                try {
                    $lastId = $this->createRemote($payload);
                    $map = $this->storeMap($product, $variant, $lastId);
                    $map->update(['remote_price' => $payload['primary_price'] ?? null, 'remote_stock' => $payload['stock'] ?? null]);
                    $created++;
                } catch (MarketplaceException $e) {
                    if ($e->isTransient() || $e->status === 401) {
                        throw $e;
                    }
                    $errors[] = sprintf('#%d [api_create]: %s', $variant->id, $e->getMessage());
                }
            }
            if ($pending > 0 && $created < 1) {
                throw new MarketplaceException(__('marketplace.basalam_variable_create_failed', ['detail' => $errors ? implode(' | ', $errors) : __('marketplace.basalam_no_eligible_variant')]), 422);
            }
            if ($pending < 1 && $skipped > 0) {
                throw new MarketplaceException(__('marketplace.basalam_all_variants_created', ['id' => $product->id]), 422);
            }
            if ($created > 0) {
                BasalamDiscounts::for($this->tid())->handleProduct($product);
            }
            $this->logInfo('محصول متغیر به‌صورت محصولات جدا در باسلام ثبت شد.', ['product_id' => $product->id, 'created' => $created, 'errors' => $errors]);

            return [
                'success' => true,
                'message' => __('marketplace.basalam_variants_created', ['count' => $created]),
                'created' => $created, 'skipped' => $skipped, 'errors' => $errors,
                'partial' => $created > 0 && $errors !== [], 'basalam_id' => $lastId,
            ];
        }

        if ($existing = $this->mapFor($product)) {
            throw new MarketplaceException(__('marketplace.basalam_already_connected', ['id' => $product->id, 'remote' => $existing->remote_product_id]), 422);
        }
        $payload = $this->payload($product, null, 'create');
        $remoteId = $this->createRemote($payload);
        $map = $this->storeMap($product, null, $remoteId);
        $map->update(['remote_price' => $payload['primary_price'] ?? null, 'remote_stock' => $payload['stock'] ?? null]);
        BasalamDiscounts::for($this->tid())->handleProduct($product);
        $this->logInfo('محصول با موفقیت به باسلام اضافه شد.', ['product_id' => $product->id, 'basalam_id' => $remoteId]);

        return ['success' => true, 'message' => __('marketplace.basalam_product_created'), 'basalam_id' => $remoteId];
    }

    /** One-off category chain for a create/update call (UI "choose category" flow). */
    protected function applyCategoryOverride(Product $product, ?array $categoryIds): void
    {
        if ($categoryIds === null) {
            return;
        }
        $ids = array_values(array_filter(array_map('intval', $categoryIds)));
        if ($ids === []) {
            return;
        }
        $meta = $product->meta ?? [];
        $meta['marketplace']['basalam']['category_ids'] = $ids;
        $product->forceFill(['meta' => $meta])->saveQuietly();
    }

    /**
     * Update according to `sync_product_fields` (all / price_stock / custom).
     *
     * @param  list<int>|null  $categoryIds
     * @return array<string, mixed>
     */
    public function update(Product $product, ?array $categoryIds = null, ?string $mode = null): array
    {
        if (! $this->isUpdateSelectionValid()) {
            throw new MarketplaceException(__('marketplace.basalam_custom_fields_required'), 422);
        }
        $maps = $this->maps($product);
        if ($maps->isEmpty()) {
            throw new MarketplaceException(__('marketplace.basalam_product_not_connected', ['id' => $product->id]), 422);
        }
        $this->assertPublishable($product, false);
        $this->applyCategoryOverride($product, $categoryIds);
        $mode ??= $this->updateMode();
        $updated = 0;
        $errors = [];
        foreach ($maps as $map) {
            if ($map->product_variant_id && ! $map->variant) {
                continue;
            }
            try {
                $this->assertUnique($map);
                $payload = $this->payload($product, $map->variant, $mode);
                if ($payload === []) {
                    continue;
                }
                $this->updateRemote((string) $map->remote_product_id, $payload);
                $meta = $map->meta ?? [];
                $meta['sync_status'] = 'synced';
                $map->update(array_filter([
                    'last_sync_at' => now(),
                    'last_error' => null,
                    'remote_price' => $payload['primary_price'] ?? null,
                    'remote_stock' => $payload['stock'] ?? null,
                    'meta' => $meta,
                ], fn ($v) => $v !== null) + ['last_error' => null]);
                $updated++;
            } catch (MarketplaceException $e) {
                $map->update(['last_error' => mb_substr($e->getMessage(), 0, 2000), 'last_sync_at' => now()]);
                if ($e->isTransient() || $e->status === 401 || $maps->count() === 1) {
                    throw $e;
                }
                $errors[] = sprintf('#%d: %s', $map->product_variant_id ?: $map->product_id, $e->getMessage());
            }
        }
        if ($updated < 1 && $errors) {
            throw new MarketplaceException(__('marketplace.basalam_variable_update_failed', ['detail' => implode(' | ', $errors)]), 422);
        }
        if ($updated > 0) {
            BasalamDiscounts::for($this->tid())->handleProduct($product);
        }
        $this->logInfo('فرایند بروزرسانی محصول با موفقیت انجام شد.', ['product_id' => $product->id, 'updated' => $updated, 'mode' => $mode]);

        return ['success' => true, 'message' => __('marketplace.basalam_product_updated', ['count' => $updated]), 'updated' => $updated, 'errors' => $errors];
    }

    /** Archive (3790) / restore (2976) every Basalam product of this local product. */
    public function setStatus(Product $product, int $status): array
    {
        $maps = $this->maps($product);
        if ($maps->isEmpty()) {
            throw new MarketplaceException(__('marketplace.basalam_product_not_connected', ['id' => $product->id]), 422);
        }
        $count = 0;
        foreach ($maps as $map) {
            $this->assertUnique($map);
            $this->updateRemote((string) $map->remote_product_id, ['status' => $status]);
            $meta = $map->meta ?? [];
            $meta['status'] = $status;
            $meta['sync_status'] = 'synced';
            $map->update(['meta' => $meta, 'last_sync_at' => now(), 'last_error' => null]);
            $count++;
        }
        $archived = $status === self::STATUS_ARCHIVED;
        $this->logInfo($archived ? 'محصول در باسلام بایگانی شد.' : 'محصول در باسلام بازگردانی شد.', ['product_id' => $product->id, 'count' => $count]);

        return [
            'success' => true,
            'message' => __($archived ? 'marketplace.basalam_archived' : 'marketplace.basalam_restored', ['count' => $count]),
            'product_id' => $product->id,
            $archived ? 'archived' : 'restored' => true,
        ];
    }

    public function archive(Product $product): array
    {
        return $this->setStatus($product, self::STATUS_ARCHIVED);
    }

    public function restore(Product $product): array
    {
        return $this->setStatus($product, self::STATUS_ACTIVE);
    }

    /** Link a local product/variant to an existing Basalam product; false when that id belongs to another item. */
    public function connect(Product $product, ?ProductVariant $variant, string $remoteId, bool $queueUpdate = true): bool
    {
        $remoteId = trim($remoteId);
        if ($remoteId === '' || ! ctype_digit($remoteId)) {
            throw new MarketplaceException(__('marketplace.basalam_connect_invalid'), 422);
        }
        $owner = MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')
            ->where('remote_product_id', $remoteId)->first();
        if ($owner) {
            return (int) $owner->product_id === (int) $product->id && (int) $owner->variant_key === (int) ($variant?->id ?? 0);
        }
        $this->storeMap($product, $variant, $remoteId);
        if ($queueUpdate && $this->isUpdateSelectionValid()) {
            $this->queue(self::JOB_UPDATE_SINGLE, ['product_id' => $product->id]);
        }

        return true;
    }

    /** Remove every Basalam map of the product (and its variants). */
    public function disconnect(Product $product): int
    {
        return MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('product_id', $product->id)
            ->where('platform', 'basalam')->delete();
    }

    // ── Queries ─────────────────────────────────────────────────────────

    protected function productQuery(): Builder
    {
        return Product::query()->where('tenant_id', $this->tid())->where('status', 'publish');
    }

    /** Published, with an image, price above 1000, in stock (unless included), not yet on Basalam. */
    public function creatableQuery(bool $includeOutOfStock = false): Builder
    {
        $q = $this->productQuery()
            ->where(fn ($w) => $w->whereNotNull('image_url')->where('image_url', '!=', ''))
            ->where('price_minor', '>', 1000)
            ->whereDoesntHave('marketplaceMaps', fn ($m) => $m->where('platform', 'basalam')->where('variant_key', 0)->whereNotNull('remote_product_id'))
            ->where(fn ($w) => $w->whereDoesntHave('variants')->orWhereHas('variants', fn ($v) => $v->whereNotExists(function ($sub) {
                $sub->selectRaw('1')->from('marketplace_product_maps as bm')->whereColumn('bm.product_variant_id', 'product_variants.id')
                    ->where('bm.platform', 'basalam')->whereNotNull('bm.remote_product_id');
            })));
        if (! $includeOutOfStock) {
            $q->where(fn ($w) => $w->where('stock_status', 'instock')->orWhereNull('stock_status'));
        }

        return $q;
    }

    public function countCreatable(bool $includeOutOfStock = false): int
    {
        return $this->creatableQuery($includeOutOfStock)->count();
    }

    public function updatableQuery(): Builder
    {
        return $this->productQuery()->whereHas('marketplaceMaps', fn ($m) => $m->where('platform', 'basalam')->whereNotNull('remote_product_id'));
    }

    /**
     * REST products list. Filter: connected | unconnected | all.
     *
     * @return array{products: list<array<string, mixed>>, total: int}
     */
    public function list(string $filter, int $page, int $perPage, string $search = ''): array
    {
        $q = Product::query()->where('tenant_id', $this->tid())->whereIn('status', ['publish', 'draft'])->with(['marketplaceMaps' => fn ($m) => $m->where('platform', 'basalam')]);
        if ($filter === 'connected') {
            $q->whereHas('marketplaceMaps', fn ($m) => $m->where('platform', 'basalam')->whereNotNull('remote_product_id'));
        } elseif ($filter === 'unconnected') {
            $q->whereDoesntHave('marketplaceMaps', fn ($m) => $m->where('platform', 'basalam')->whereNotNull('remote_product_id'));
        }
        if (trim($search) !== '') {
            $term = '%'.trim($search).'%';
            $q->where(fn ($w) => $w->where('name', 'like', $term)->orWhere('sku', 'like', $term));
        }
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('id')->forPage(max(1, $page), $perPage)->get();

        return [
            'products' => $rows->map(function (Product $p) {
                $maps = $p->marketplaceMaps->filter(fn ($m) => filled($m->remote_product_id));
                $first = $maps->first();
                $errors = $maps->filter(fn ($m) => filled($m->last_error));

                return [
                    'id' => $p->id,
                    'name' => $p->name,
                    'sku' => $p->sku,
                    'status' => $p->status,
                    'image_url' => $p->image_url,
                    'type' => $p->type,
                    'basalam_product_id' => $first?->remote_product_id,
                    'basalam_product_ids' => $maps->pluck('remote_product_id')->values()->all(),
                    'basalam_status' => $first ? (int) (($first->meta ?? [])['status'] ?? self::STATUS_ACTIVE) : null,
                    'connected' => $maps->isNotEmpty(),
                    'sync_status' => $maps->isEmpty() ? null : ($errors->isNotEmpty() ? 'failed' : 'synced'),
                    'last_error' => $errors->first()?->last_error,
                    'last_sync_at' => optional($maps->max('last_sync_at'))->toIso8601String(),
                ];
            })->all(),
            'total' => $total,
        ];
    }

    // ── Remote catalogue / auto-connect ─────────────────────────────────

    /** @return array{data: list<array<string, mixed>>, has_more: bool, next_cursor: mixed} */
    public function remoteProducts(?string $title = null, mixed $cursor = null): array
    {
        $query = ['per_page' => 30];
        $vendor = $this->client->auth()->vendorId();
        if ($vendor > 0) {
            $query['vendor_ids'] = $vendor;
        }
        if ($title !== null && trim($title) !== '') {
            $query['product_title'] = mb_substr(trim($title), 0, 120);
        }
        if ($cursor !== null && $cursor !== '') {
            $query['cursor'] = $cursor;
        }
        $body = $this->client->get(BasalamEndpoints::PRODUCTS_DATA, $query);
        $next = $body['next_cursor'] ?? null;

        return ['data' => array_values(array_filter((array) ($body['data'] ?? []), 'is_array')), 'has_more' => $next !== null, 'next_cursor' => $next];
    }

    /** @return array{0: ?Product, 1: ?ProductVariant} Unmapped local item matching a Basalam product (SKU → variant title → title). */
    public function findLocalMatch(array $remote): array
    {
        $sku = '';
        foreach (['sku', 'product_sku', 'barcode'] as $key) {
            if (! empty($remote[$key]) && is_scalar($remote[$key])) {
                $sku = trim((string) $remote[$key]);
                break;
            }
        }
        $mapped = MarketplaceProductMap::query()->where('tenant_id', $this->tid())->where('platform', 'basalam')->whereNotNull('remote_product_id')
            ->get(['product_id', 'variant_key'])->map(fn ($m) => $m->product_id.':'.$m->variant_key)->flip();
        $free = fn (Product $p, ?ProductVariant $v) => ! isset($mapped[$p->id.':'.($v?->id ?? 0)]);

        if ($sku !== '') {
            $variant = ProductVariant::query()->where('tenant_id', $this->tid())->where('sku', $sku)->with('product')->first();
            if ($variant && $variant->product && $variant->product->status === 'publish' && $free($variant->product, $variant)) {
                return [$variant->product, $variant];
            }
            $product = $this->productQuery()->where('sku', $sku)->first();
            if ($product && $free($product, null) && ! $this->isVariable($product)) {
                return [$product, null];
            }
        }
        $title = trim((string) ($remote['title'] ?? $remote['name'] ?? ''));
        if ($title === '') {
            return [null, null];
        }
        $target = BasalamCommission::normalizeName($title);
        foreach ($this->productQuery()->whereHas('variants')->with('variants')->limit(200)->get() as $parent) {
            foreach ($parent->variants as $variant) {
                if (! $free($parent, $variant)) {
                    continue;
                }
                $built = $this->name($parent, $variant);
                if (BasalamCommission::normalizeName($built) === $target
                    || mb_strtolower(mb_substr(trim($built), 0, 120)) === mb_strtolower(mb_substr($title, 0, 120))) {
                    return [$parent, $variant];
                }
            }
        }
        $candidates = [$title];
        $stripped = preg_replace('/\s*[\|\-–—]\s*[^\|\-–—]{1,40}$/u', '', $title);
        if (is_string($stripped) && $stripped !== '' && $stripped !== $title) {
            $candidates[] = trim($stripped);
        }
        foreach ($candidates as $candidate) {
            $like = mb_strlen($candidate) >= 120 ? mb_substr($candidate, 0, 120).'%' : $candidate;
            $product = $this->productQuery()->whereDoesntHave('variants')->whereRaw('LOWER(name) LIKE ?', [mb_strtolower($like)])->orderBy('id')->first();
            if ($product && $free($product, null)) {
                return [$product, null];
            }
            $norm = BasalamCommission::normalizeName($candidate);
            foreach ($this->productQuery()->whereDoesntHave('variants')->orderBy('id')->limit(800)->get(['id', 'name', 'tenant_id', 'type', 'status']) as $p) {
                if ($free($p, null) && BasalamCommission::normalizeName((string) $p->name) === $norm) {
                    return [$p, null];
                }
            }
        }

        return [null, null];
    }

    /** One auto-connect page (AutoConnectProducts::checkSameProduct without title). */
    public function autoConnectPage(mixed $cursor = null): array
    {
        $page = $this->remoteProducts(null, $cursor);
        $matched = 0;
        $skipped = 0;
        foreach ($page['data'] as $remote) {
            if (empty($remote['id'])) {
                $skipped++;

                continue;
            }
            [$product, $variant] = $this->findLocalMatch($remote);
            if (! $product) {
                $skipped++;

                continue;
            }
            if ($this->connect($product, $variant, (string) $remote['id'], false)) {
                $matched++;
                $this->logInfo(($remote['title'] ?? '').' به محصول مشابه خود در باسلام متصل شد', ['product_id' => $product->id, 'variant_id' => $variant?->id, 'basalam_id' => $remote['id']]);
            } else {
                $skipped++;
            }
        }
        MarketplaceLogger::info($this->tid(), 'basalam', 'product', sprintf('اتصال خودکار: matched=%d skipped=%d', $matched, $skipped));

        return ['matched' => $matched, 'skipped' => $skipped, 'has_more' => $page['has_more'] && ! empty($page['next_cursor']), 'next_cursor' => $page['next_cursor']];
    }

    // ── Jobs ────────────────────────────────────────────────────────────

    /** @param  array<string, mixed>  $payload */
    public function queue(string $type, array $payload = [], int $delay = 0, ?string $key = null): void
    {
        $key ??= isset($payload['product_id']) ? $type.':'.$payload['product_id'] : null;
        $this->sync()->enqueue($this->tid(), 'basalam', $type, $payload, self::PRIORITIES[$type] ?? 5, $delay, $key);
    }

    protected function jobProduct(array $payload): Product
    {
        $product = Product::query()->where('tenant_id', $this->tid())->find((int) ($payload['product_id'] ?? 0));
        if (! $product) {
            throw new MarketplaceException(__('marketplace.basalam_product_missing'), 404);
        }

        return $product;
    }

    /** @param  array<string, mixed>  $payload */
    public function runJob(string $type, array $payload): ?array
    {
        return match ($type) {
            self::JOB_CREATE_SINGLE => $this->create($this->jobProduct($payload), isset($payload['category_ids']) ? (array) $payload['category_ids'] : null),
            self::JOB_UPDATE_SINGLE => $this->update($this->jobProduct($payload), isset($payload['category_ids']) ? (array) $payload['category_ids'] : null),
            self::JOB_ARCHIVE => $this->archive($this->jobProduct($payload)),
            self::JOB_RESTORE => $this->restore($this->jobProduct($payload)),
            self::JOB_CREATE_ALL => $this->createAllJob($payload),
            self::JOB_UPDATE_ALL => $this->updateAllJob($payload),
            self::JOB_BULK_UPDATE => $this->bulkUpdateJob($payload),
            self::JOB_AUTO_CONNECT => $this->autoConnectJob($payload),
            default => null,
        };
    }

    /** @param  array<string, mixed>  $payload */
    public function createAllJob(array $payload): array
    {
        $lastId = (int) ($payload['last_creatable_product_id'] ?? 0);
        $includeOut = (bool) ($payload['include_out_of_stock'] ?? false);
        $ids = $this->creatableQuery($includeOut)->where('id', '>', $lastId)->orderBy('id')->limit(100)->pluck('id')->all();
        if (! $ids) {
            if ($lastId <= 0) {
                throw new MarketplaceException(__('marketplace.basalam_no_creatable'), 422);
            }

            return ['completed' => true];
        }
        foreach ($ids as $id) {
            $this->queue(self::JOB_CREATE_SINGLE, ['product_id' => (int) $id]);
        }
        $next = (int) max($ids);
        $this->queue(self::JOB_CREATE_ALL, ['last_creatable_product_id' => $next, 'include_out_of_stock' => $includeOut], 5, self::JOB_CREATE_ALL.':'.$next);

        return ['last_id' => $next, 'count' => count($ids)];
    }

    /** @param  array<string, mixed>  $payload */
    public function updateAllJob(array $payload): array
    {
        if (! $this->isUpdateSelectionValid()) {
            throw new MarketplaceException(__('marketplace.basalam_custom_fields_required'), 422);
        }
        $lastId = (int) ($payload['last_updatable_product_id'] ?? 0);
        $ids = $this->updatableQuery()->where('id', '>', $lastId)->orderBy('id')->limit(100)->pluck('id')->all();
        if (! $ids) {
            return ['completed' => true];
        }
        foreach ($ids as $id) {
            $this->queue(self::JOB_UPDATE_SINGLE, ['product_id' => (int) $id]);
        }
        $next = (int) max($ids);
        $this->queue(self::JOB_UPDATE_ALL, ['last_updatable_product_id' => $next], 5, self::JOB_UPDATE_ALL.':'.$next);

        return ['last_id' => $next, 'count' => count($ids)];
    }

    /** Quick price/stock batch update (10 products per request, one request per 12 seconds). */
    public function bulkUpdateJob(array $payload): array
    {
        if (! $this->isUpdateSelectionValid()) {
            throw new MarketplaceException(__('marketplace.basalam_custom_fields_required'), 422);
        }
        $lastId = (int) ($payload['last_updatable_product_id'] ?? 0);
        $products = $this->updatableQuery()->where('id', '>', $lastId)->orderBy('id')->limit(10)->get();
        if ($products->isEmpty()) {
            $this->logInfo('بروزرسانی دسته‌ای: همه محصولات بروزرسانی شدند.');

            return ['completed' => true];
        }
        $rows = [];
        $sent = [];
        foreach ($products as $product) {
            foreach ($this->maps($product) as $map) {
                if ($map->product_variant_id && ! $map->variant) {
                    continue;
                }
                if ($this->conflictsFor($map)) {
                    $this->reportConflict((int) $product->id, $this->conflictsFor($map));

                    continue;
                }
                try {
                    $data = $this->payload($product, $map->variant, 'quick_update');
                } catch (Throwable) {
                    continue;
                }
                if ($data !== []) {
                    $rows[] = ['id' => (int) $map->remote_product_id] + $data;
                    $sent[] = [$map, $data];
                }
            }
        }
        if ($rows) {
            $this->client->patch(sprintf(BasalamEndpoints::PRODUCT_BATCH_UPDATE, $this->client->vendorId()), ['data' => $rows]);
            foreach ($sent as [$map, $data]) {
                $map->update(['last_sync_at' => now(), 'last_error' => null, 'remote_price' => $data['primary_price'] ?? $map->remote_price, 'remote_stock' => $data['stock'] ?? $map->remote_stock]);
            }
            $this->logInfo('بروزرسانی دسته جمعی محصولات با موفقیت انجام شد.', ['count' => count($rows)]);
        }
        $next = (int) $products->max('id');
        $this->queue(self::JOB_BULK_UPDATE, ['last_updatable_product_id' => $next], self::BULK_INTERVAL, self::JOB_BULK_UPDATE.':'.$next);

        return ['last_id' => $next, 'count' => count($rows)];
    }

    /** @param  array<string, mixed>  $payload */
    public function autoConnectJob(array $payload): array
    {
        $cursor = $payload['cursor'] ?? null;
        $thenUpdate = ! empty($payload['then_update']);
        $result = $this->autoConnectPage($cursor);
        if ($result['has_more']) {
            $this->queue(self::JOB_AUTO_CONNECT, array_filter(['cursor' => $result['next_cursor'], 'then_update' => $thenUpdate ?: null]), 0, self::JOB_AUTO_CONNECT.':'.md5((string) json_encode($result['next_cursor'])));
        } elseif ($thenUpdate) {
            $this->queue(self::JOB_UPDATE_ALL, [], 0, self::JOB_UPDATE_ALL.':start');
        }

        return $result + ['cursor' => $cursor];
    }

    /** Observer hook: queue a full update of connected products when auto product sync is on. */
    public function productChanged(Product $product): void
    {
        if (empty($this->engine()['sync_status_product']) || ! $this->isUpdateSelectionValid() || $this->maps($product)->isEmpty()) {
            return;
        }
        $this->queue(self::JOB_UPDATE_SINGLE, ['product_id' => $product->id], 10);
    }

    /** @param  array<string, mixed>  $meta */
    protected function logInfo(string $message, array $meta = []): void
    {
        MarketplaceLogger::info($this->tid(), 'basalam', 'product', $message, $meta);
    }
}
