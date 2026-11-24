<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\Product;

trait SerializesCatalogProduct
{
    /** @return array<string, mixed> */
    protected function serializeProduct(Product $product, bool $includeEngagement = false): array
    {
        $regular = (int) $product->price_minor;
        $discounted = $product->storefrontPriceMinor();

        $available = $product->is_available && ! $product->is_sold_out;

        // Outside its serving window an item is not sold, whatever the flag says — the guest
        // must not be able to order the soup at eight in the morning. The window is resolved
        // from the already-loaded relation when a caller eager-loads it, and read once per
        // request otherwise.
        $window = $this->servingWindowStatus($product);

        if (! $window['available']) {
            $available = false;
        }

        $data = [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'image_url' => $product->image_url,
            'cover_image_url' => $product->cover_image_url,
            'image_card_url' => $product->image_card_url,
            'video_url' => $product->video_url,
            'price_minor' => $regular,
            'sale_price_minor' => $product->isOnSale() ? $discounted : null,
            'discounted_price_minor' => $discounted,
            'currency' => $product->currency,
            'is_available' => $available,
            'available_from' => $window['next_opens_at'],
            'serving_window' => $window['label'],
            'is_sold_out' => $product->is_sold_out,
            'is_new' => $product->is_new,
            'is_featured' => $product->is_featured,
            'discount_percent' => $product->discount_percent,
            'sale_ends_at' => $product->isOnSale() ? optional($product->sale_ends_at)?->toIso8601String() : null,
            'stock' => $product->manage_stock && $product->stock !== null ? (int) $product->stock : null,
            'price_updated_at' => optional($product->price_updated_at)?->toIso8601String(),
            'faqs' => is_array($product->faqs) ? $product->faqs : [],
            'calories' => $product->calories,
            'spice_level' => $product->spice_level,
            'menu_id' => $product->menu_id,
            'category' => $product->category,
            'brands' => $product->relationLoaded('brands')
                ? $product->brands->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'slug' => $b->slug])->values()
                : [],
            'variants' => $product->variants,
            'media' => $product->relationLoaded('media') ? $product->media : [],
            'allergens' => $product->relationLoaded('allergens') ? $product->allergens : [],
            'has_service' => (bool) $product->has_service,
            'service_label_fa' => $product->service_label_fa,
            'service_label_en' => $product->service_label_en,
            'daily_dish' => is_array($product->daily_dish) ? array_values($product->daily_dish) : [],
            'gallery_views' => $product->relationLoaded('galleryViews')
                ? $product->galleryViews->map(fn ($view) => [
                    'id' => $view->id,
                    'type' => $view->type,
                    'url' => $view->url,
                    'poster_url' => $view->poster_url,
                    'frames' => (int) $view->frames,
                ])->values()
                : [],
            'modifiers' => $product->relationLoaded('modifiers')
                ? $product->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name_fa' => $m->name_fa,
                    'name_en' => $m->name_en,
                    'min_select' => $m->min_select,
                    'max_select' => $m->max_select,
                    'is_required' => $m->is_required,
                    'sort_order' => $m->sort_order,
                    'options' => $m->relationLoaded('options')
                        ? $m->options->map(fn ($o) => [
                            'id' => $o->id,
                            'name_fa' => $o->name_fa,
                            'name_en' => $o->name_en,
                            'price_minor' => (int) $o->price_minor,
                            'is_default' => (bool) $o->is_default,
                            'is_addon' => (bool) ($o->is_addon ?? false),
                            'sort_order' => (int) $o->sort_order,
                        ])->values()
                        : [],
                ])
                : [],
        ];

        if ($includeEngagement && $product->relationLoaded('likes')) {
            $data['likes_count'] = $product->likes->count();
        }

        return $data;
    }

    /**
     * Where a product stands against its serving window.
     *
     * Cached per request: a menu page serializes eighty products and each one would otherwise
     * build the same window list. A shop with no windows pays one query.
     *
     * @return array{available: bool, label: ?string, next_opens_at: ?string}
     */
    private function servingWindowStatus(\App\Models\Product $product): array
    {
        $tenantId = (int) ($product->tenant_id ?? 0);

        if ($tenantId <= 0) {
            return ['available' => true, 'label' => null, 'next_opens_at' => null];
        }

        /** @var array<int, array{available: bool, label: ?string, next_opens_at: ?string}> $cache */
        static $cache = [];

        if (isset($cache[(int) $product->id])) {
            return $cache[(int) $product->id];
        }

        try {
            $status = app(\Modules\Cafe\Services\ServingWindows::class)->statusFor(
                $tenantId,
                (int) $product->id,
                $product->category_id === null ? null : (int) $product->category_id,
            );
        } catch (\Throwable) {
            // A menu that cannot read its windows still sells; a menu that throws does not.
            $status = ['available' => true, 'label' => null, 'next_opens_at' => null];
        }

        return $cache[(int) $product->id] = [
            'available' => (bool) $status['available'],
            'label' => $status['label'],
            'next_opens_at' => $status['next_opens_at'],
        ];
    }
}
