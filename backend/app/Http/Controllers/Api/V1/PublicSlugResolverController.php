<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductTag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * WooCommerce-style root URLs (/{slug}/, /برند/{slug}/, /برچسب/{slug}/) → resource type.
 * Lookup order mirrors parisma.ir permalinks: product, category, brand, tag.
 */
class PublicSlugResolverController extends Controller
{
    use ResolvesPublicTenant;

    public function resolve(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug' => 'required|string|max:191',
            'scope' => 'nullable|in:any,product,category,brand,tag',
        ]);
        $tid = $this->publicTenantId($request);
        $slug = trim(rawurldecode($data['slug']), '/');
        $scope = $data['scope'] ?? 'any';
        $published = fn ($q) => $q->where(fn ($w) => $w->whereNull('status')->orWhere('status', 'publish'));

        $hit = null;
        if (in_array($scope, ['any', 'product'], true)) {
            $p = Product::query()->where('tenant_id', $tid)->where('slug', $slug)->storefront()->first(['id', 'slug', 'name']);
            if ($p) $hit = ['type' => 'product', 'slug' => $p->slug, 'name' => $p->name];
        }
        if (! $hit && in_array($scope, ['any', 'category'], true)) {
            $c = $published(Category::query()->where('tenant_id', $tid)->where('slug', $slug))->first(['id', 'slug', 'name']);
            if ($c) $hit = ['type' => 'category', 'slug' => $c->slug, 'name' => $c->name];
        }
        if (! $hit && in_array($scope, ['any', 'brand'], true)) {
            $b = $published(Brand::query()->where('tenant_id', $tid)->where('slug', $slug))->first(['id', 'slug', 'name']);
            if ($b) $hit = ['type' => 'brand', 'slug' => $b->slug, 'name' => $b->name];
        }
        if (! $hit && in_array($scope, ['any', 'tag'], true)) {
            $t = ProductTag::query()->where('tenant_id', $tid)->where('slug', $slug)->first(['id', 'slug', 'name']);
            if ($t) $hit = ['type' => 'tag', 'slug' => $t->slug, 'name' => $t->name];
        }
        abort_unless($hit, 404);

        return response()->json(['data' => $hit])->header('Cache-Control', 'public, max-age=60');
    }
}
