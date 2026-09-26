<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Shipping\TapinClient;
use Illuminate\Support\Facades\Http;

class ShippingZonesTest extends CommerceAndSetupTest
{
    protected function cartWith(User $user, int $priceMinor): void
    {
        $tid = $user->tenant_id;
        $cat = Category::query()->create(['tenant_id' => $tid, 'name' => 'C', 'slug' => 'c']);
        $product = Product::query()->create([
            'tenant_id' => $tid,
            'category_id' => $cat->id,
            'name' => 'P',
            'sku' => 's',
            'price_minor' => $priceMinor,
            'currency' => 'IRR',
            'stock' => 5,
        ]);
        $cart = Cart::query()->create(['tenant_id' => $tid, 'user_id' => $user->id]);
        CartItem::query()->create(['cart_id' => $cart->id, 'product_id' => $product->id, 'quantity' => 1]);
    }

    public function test_zone_crud_and_checkout_uses_matched_state_rate(): void
    {
        $user = $this->actingTenantUser();
        $this->actingAs($user, 'sanctum');

        $zoneId = $this->postJson('/api/v1/shipping/zones', ['name' => 'Tehran'])
            ->assertCreated()
            ->json('data.zone.id');

        $this->putJson("/api/v1/shipping/zones/{$zoneId}", [
            'locations' => [['type' => 'state', 'code' => 'IR:TE']],
        ])->assertOk();

        $instanceId = $this->postJson("/api/v1/shipping/zones/{$zoneId}/methods", ['method_id' => 'flat_rate'])
            ->assertCreated()
            ->json('data.method.instance_id');

        $this->putJson("/api/v1/shipping/zones/{$zoneId}/methods/{$instanceId}", [
            'settings' => ['cost' => 350],
        ])->assertOk()->assertJsonPath('data.method.settings.cost', 350);

        $this->postJson('/api/v1/shipping/quote', ['state_code' => 'IR:IS', 'cart_subtotal_minor' => 1000])
            ->assertOk()
            ->assertJsonCount(0, 'data.rates');

        $this->cartWith($user, 1000);
        $this->postJson('/api/v1/checkout', [
            'shipping_address' => 'Tehran',
            'shipping_state_code' => 'IR:TE',
            'shipping_instance_id' => $instanceId,
        ])->assertCreated();

        $order = Order::query()->where('tenant_id', $user->tenant_id)->latest('id')->first();
        $this->assertSame(350, $order->shipping_minor);
        $this->assertSame(1350, $order->total_minor);
        $this->assertSame('flat_rate', $order->meta['shipping_method_id']);

        $this->deleteJson("/api/v1/shipping/zones/{$zoneId}")->assertOk();
        $this->getJson('/api/v1/shipping/zones')->assertOk()->assertJsonCount(0, 'data.zones');
    }

    public function test_free_shipping_requires_minimum(): void
    {
        $user = $this->actingTenantUser();
        $this->actingAs($user, 'sanctum');

        $zoneId = $this->postJson('/api/v1/shipping/zones', ['name' => 'Iran'])->json('data.zone.id');
        $instanceId = $this->postJson("/api/v1/shipping/zones/{$zoneId}/methods", ['method_id' => 'free_shipping'])
            ->json('data.method.instance_id');
        $this->putJson("/api/v1/shipping/zones/{$zoneId}/methods/{$instanceId}", [
            'settings' => ['min_amount' => 5000],
        ])->assertOk();

        $this->postJson('/api/v1/shipping/quote', ['cart_subtotal_minor' => 1000])
            ->assertJsonCount(0, 'data.rates');
        $this->postJson('/api/v1/shipping/quote', ['cart_subtotal_minor' => 6000])
            ->assertJsonCount(1, 'data.rates')
            ->assertJsonPath('data.rates.0.cost_minor', 0);
    }

    public function test_tapin_blank_token_keeps_previous_and_is_masked(): void
    {
        $user = $this->actingTenantUser();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/shipping/tapin', ['settings' => ['token' => 'secret-1', 'shop_id' => 'S1']])
            ->assertOk()
            ->assertJsonPath('data.settings.has_token', true)
            ->assertJsonMissingPath('data.settings.token');

        $this->postJson('/api/v1/shipping/tapin', ['settings' => ['token' => '', 'enabled' => true]])->assertOk();

        $raw = app(TapinClient::class)->getRaw($user->tenant_id);
        $this->assertSame('secret-1', $raw['token']);
        $this->assertTrue($raw['enabled']);
    }

    public function test_tapin_register_stores_barcode_on_order(): void
    {
        $user = $this->actingTenantUser();
        $this->actingAs($user, 'sanctum');
        $this->postJson('/api/v1/shipping/tapin', [
            'settings' => ['token' => 'tok', 'shop_id' => 'S1', 'enabled' => true],
        ])->assertOk();

        Http::fake([
            'api.tapin.ir/api/v2/public/order/post/register/*' => Http::response([
                'returns' => ['status' => 200, 'message' => 'ok'],
                'entries' => ['order_id' => 'T-9', 'barcode' => '123456789'],
            ]),
        ]);

        $order = Order::query()->create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'status' => 'processing',
            'total_minor' => 1000,
            'currency' => 'IRR',
            'shipping_address' => 'Tehran',
        ]);

        $this->postJson("/api/v1/orders/{$order->id}/tapin/register", ['service' => 'pishtaz'])
            ->assertOk()
            ->assertJsonPath('data.tapin.barcode', '123456789');

        Http::assertSent(fn ($req) => $req->hasHeader('Authorization', 'tok')
            && str_contains($req->url(), 'order/post/register'));
        $this->assertSame('T-9', $order->fresh()->meta['tapin']['order_id']);
    }
}
