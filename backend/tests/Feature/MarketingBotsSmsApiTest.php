<?php

namespace Tests\Feature;

use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarketingBotsSmsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function marketingUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'Mkt',
            'slug' => 'mkt-shop',
            'domain' => 'mkt.test',
            'license_key' => 'lic-mkt',
            'setup_completed' => true,
            'store_display_name' => 'Mkt',
            'default_currency' => 'IRR',
        ]);

        $this->enableSubmodules($tenant->id, [
            'marketing.coupons' => true,
            'bots.bale' => true,
            'bots.telegram' => true,
            'sms-panel.panel' => true,
            'commerce.checkout' => true,
            'commerce.cart' => true,
            'commerce.catalog' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        return $user;
    }

    public function test_coupon_crud_and_checkout_apply(): void
    {
        $user = $this->marketingUser();
        $this->actingAs($user, 'sanctum');

        $created = $this->postJson('/api/v1/marketing/coupons', [
            'code' => 'SAVE10',
            'type' => 'percent',
            'amount' => 10,
            'status' => 'publish',
            'restrictions' => ['channels' => ['site']],
        ])->assertCreated()->json('data');

        $this->assertSame('SAVE10', $created['code']);

        $this->getJson('/api/v1/marketing/coupons?search=SAVE')
            ->assertOk()
            ->assertJsonPath('meta.stats.total', 1);

        $product = Product::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => 'P',
            'slug' => 'p',
            'price_minor' => 10000,
            'currency' => 'IRR',
            'status' => 'publish',
        ]);

        $cart = Cart::query()->create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
        ]);
        CartItem::query()->create([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'quantity' => 1,
        ]);

        $order = $this->postJson('/api/v1/checkout', [
            'coupon_code' => 'SAVE10',
            'channel' => 'site',
        ])->assertCreated()->json('data');

        $this->assertSame(1000, $order['discount_minor']);
        $this->assertSame(9000, $order['total_minor']);
        $this->assertSame('SAVE10', $order['coupon_code']);
        $this->assertSame(1, Coupon::query()->find($created['id'])->usage_count);
    }

    public function test_bot_settings_broadcast_start_stub(): void
    {
        $user = $this->marketingUser();
        $this->actingAs($user, 'sanctum');

        Http::fake([
            'tapi.bale.ai/*' => Http::response(['ok' => true], 200),
        ]);

        $this->putJson('/api/v1/bots/bale/settings', [
            'enabled' => true,
            'token' => 'test-token',
        ])->assertOk()->assertJsonPath('data.enabled', true);

        BotSession::query()->create([
            'tenant_id' => $user->tenant_id,
            'provider' => 'bale',
            'chat_id' => '111',
            'last_seen_at' => now(),
        ]);

        $this->postJson('/api/v1/bots/bale/broadcast/start', [
            'type' => 'text',
            'text' => 'Hello',
            'segment' => 'all',
        ])->assertOk()->assertJsonPath('data.ok', true);

        $this->getJson('/api/v1/bots/bale/broadcast')
            ->assertOk()
            ->assertJsonPath('data.job.total', 1);
    }

    public function test_sms_proxy_mock(): void
    {
        $user = $this->marketingUser();
        $this->actingAs($user, 'sanctum');

        Http::fake([
            '*/api/webinocrm/v1/modirpayamak/dashboard*' => Http::response(['ok' => true, 'balance' => 12], 200),
        ]);

        config(['services.webino.base_url' => 'https://crm.test']);

        $this->getJson('/api/v1/modirpayamak/dashboard')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('balance', 12);
    }

    public function test_bot_webhook_registers_session(): void
    {
        $user = $this->marketingUser();
        $setting = BotSetting::query()->create([
            'tenant_id' => $user->tenant_id,
            'provider' => 'telegram',
            'enabled' => true,
            'token' => 'tok',
            'webhook_secret' => 'sec123',
        ]);

        $this->postJson('/api/v1/public/bots/telegram/webhook?secret=sec123', [
            'message' => [
                'chat' => ['id' => 999],
                'text' => 'hi',
                'from' => ['id' => 1],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('bot_sessions', [
            'tenant_id' => $setting->tenant_id,
            'provider' => 'telegram',
            'chat_id' => '999',
        ]);
    }
}
