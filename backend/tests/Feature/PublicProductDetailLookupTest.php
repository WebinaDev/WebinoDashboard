<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicProductDetailLookupTest extends TestCase
{
    use RefreshDatabase;

    private function product(int $tenantId, string $slug, array $extra = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $tenantId, 'name' => $slug, 'slug' => $slug, 'price_minor' => 1000, 'currency' => 'IRR',
            'status' => 'publish', 'stock' => 5, 'stock_status' => 'instock', 'manage_stock' => true,
            'is_available' => true, 'is_hidden' => false, 'type' => 'simple',
        ], $extra));
    }

    public function test_detail_resolves_by_slug_id_and_encoded_slug_with_tenant_and_visibility(): void
    {
        $tenant = $this->createTenant(['slug' => 'pdp', 'domain' => 'pdp.test']);
        $this->enableSubmodules($tenant->id, ['commerce.catalog' => true]);
        $p = $this->product($tenant->id, 'serum-x');
        $fa = $this->product($tenant->id, strtolower(rawurlencode('سرم-آبرسان')));
        $sold = $this->product($tenant->id, 'sold', ['stock' => 0, 'stock_status' => 'outofstock', 'is_sold_out' => true, 'is_available' => false]);
        $draft = $this->product($tenant->id, 'draft', ['status' => 'draft']);
        $other = $this->createTenant(['slug' => 'pdp-o']);
        $foreign = $this->product($other->id, 'foreign');

        $get = fn (string $k) => $this->withHeader('X-Tenant-Domain', 'pdp.test')->getJson('/api/v1/public/catalog/items/'.$k);

        $get('serum-x')->assertOk()->assertJsonPath('data.id', $p->id);
        $get((string) $p->id)->assertOk()->assertJsonPath('data.slug', 'serum-x');
        $get(rawurlencode('سرم-آبرسان'))->assertOk()->assertJsonPath('data.id', $fa->id);
        $get((string) $sold->id)->assertOk();
        $get((string) $draft->id)->assertNotFound();
        $get((string) $foreign->id)->assertNotFound();
    }
}
