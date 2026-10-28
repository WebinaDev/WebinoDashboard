<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Postgres 500'd on ?category=skin-care because the slug was also compared to the integer id. */
class PublicCatalogTermFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_category_and_brand_filters_match_slug_or_numeric_id_only(): void
    {
        $tenant = $this->createTenant(['slug' => 'cat', 'domain' => 'cat.test']);
        $this->enableSubmodules($tenant->id, ['commerce.catalog' => true]);
        $cat = Category::query()->create(['tenant_id' => $tenant->id, 'name' => 'Skin', 'slug' => 'skin-care']);
        $brand = Brand::query()->create(['tenant_id' => $tenant->id, 'name' => 'Sheglam', 'slug' => 'sheglam']);
        $base = ['tenant_id' => $tenant->id, 'price_minor' => 1000, 'currency' => 'IRR', 'status' => 'publish', 'stock' => 5,
            'stock_status' => 'instock', 'manage_stock' => true, 'is_available' => true, 'is_hidden' => false, 'type' => 'simple'];
        $in = Product::query()->create($base + ['name' => 'in', 'slug' => 'in', 'category_id' => $cat->id]);
        $in->brands()->attach($brand->id);
        Product::query()->create($base + ['name' => 'out', 'slug' => 'out']);

        $queries = [];
        DB::listen(function ($q) use (&$queries) { $queries[] = $q; });
        $get = fn (string $qs) => $this->withHeader('X-Tenant-Domain', 'cat.test')->getJson('/api/v1/public/catalog?'.$qs);

        foreach (['category=skin-care', 'category='.$cat->id, 'brand=sheglam', 'brand='.$brand->id] as $qs) {
            $res = $get($qs)->assertOk();
            $this->assertSame(['in'], collect($res->json('data.items'))->pluck('slug')->all(), $qs);
        }

        foreach ($queries as $q) {
            foreach (['skin-care', 'sheglam'] as $slug) {
                if (in_array($slug, $q->bindings, true)) {
                    $this->assertDoesNotMatchRegularExpression('/["`.]id["`]? = \?/', $q->sql, 'slug compared to integer id: '.$q->sql);
                }
            }
        }
    }
}
