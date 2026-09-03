<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\Product;

trait SerializesCatalogProduct
{
    /** @return array<string, mixed> */
    protected function serializeProduct(Product $product, bool $includeEngagement = false): array
    {
        $discounted = $product->discount_percent > 0
            ? (int) round($product->price_minor * (100 - $product->discount_percent) / 100)
            : $product->price_minor;

        $available = $product->is_available && ! $product->is_sold_out;

        $data = [
            'id' => $product->id,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'image_url' => $product->image_url,
            'cover_image_url' => $product->cover_image_url,
            'video_url' => $product->video_url,
            'price_minor' => $product->price_minor,
            'discounted_price_minor' => $discounted,
            'currency' => $product->currency,
            'is_available' => $available,
            'is_sold_out' => $product->is_sold_out,
            'is_new' => $product->is_new,
            'is_featured' => $product->is_featured,
            'discount_percent' => $product->discount_percent,
            'calories' => $product->calories,
            'spice_level' => $product->spice_level,
            'menu_id' => $product->menu_id,
            'category' => $product->category,
            'variants' => $product->variants,
            'media' => $product->relationLoaded('media') ? $product->media : [],
            'allergens' => $product->relationLoaded('allergens') ? $product->allergens : [],
            'modifiers' => $product->relationLoaded('modifiers')
                ? $product->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name_fa' => $m->name_fa,
                    'name_en' => $m->name_en,
                    'min_select' => $m->min_select,
                    'max_select' => $m->max_select,
                    'is_required' => $m->is_required,
                    'sort_order' => $m->sort_order,
                    'options' => $m->relationLoaded('options') ? $m->options : [],
                ])
                : [],
        ];

        if ($includeEngagement && $product->relationLoaded('likes')) {
            $data['likes_count'] = $product->likes->count();
        }

        return $data;
    }
}
