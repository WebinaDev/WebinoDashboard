<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicLinkedProductsTest extends TestCase
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

    public function test_upsells_and_cross_sells_in_order_and_visible_only(): void
    {
        $tenant = $this->createTenant(['slug' => 'linked', 'domain' => 'linked.test']);
        $this->enableSubmodules($tenant->id, ['commerce.catalog' => true]);
        $a = $this->product($tenant->id, 'a');
        $b = $this->product($tenant->id, 'b');
        $hidden = $this->product($tenant->id, 'h', ['status' => 'draft']);
        $other = $this->createTenant(['slug' => 'linked-o']);
        $foreign = $this->product($other->id, 'f');
        $main = $this->product($tenant->id, 'main', ['upsell_ids' => [$b->id, $a->id, $hidden->id, $foreign->id], 'cross_sell_ids' => [$a->id]]);

        $get = fn (string $q) => $this->withHeader('X-Tenant-Domain', 'linked.test')->getJson('/api/v1/public/catalog/items/main/linked'.$q);
        $this->assertSame(['b', 'a'], array_column($get('?type=upsell')->assertOk()->json('data.items'), 'slug'));
        $this->assertSame(['a'], array_column($get('?type=cross_sell')->assertOk()->json('data.items'), 'slug'));
        $get('?type=nope')->assertStatus(422);
        $this->assertNotNull($main);
    }
}
