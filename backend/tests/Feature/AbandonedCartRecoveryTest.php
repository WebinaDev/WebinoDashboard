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
use App\Services\Marketing\AbandonedCartService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AbandonedCartRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_stages_send_bot_reminder_with_coupon_and_reset_on_activity(): void
    {
        Http::fake(['tapi.bale.ai/*' => Http::response(['ok' => true], 200)]);
        $tenant = Tenant::query()->create(['name' => 'A', 'slug' => 'ab-shop', 'domain' => 'ab.test', 'license_key' => 'l-ab', 'setup_completed' => true, 'store_display_name' => 'فروشگاه آ']);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'customer', 'name' => 'مریم', 'phone' => '09120001111']);
        BotSetting::query()->create(['tenant_id' => $tenant->id, 'provider' => 'bale', 'enabled' => true, 'token' => 't', 'webhook_secret' => 's']);
        BotSession::query()->create(['tenant_id' => $tenant->id, 'provider' => 'bale', 'chat_id' => '42', 'user_id' => $user->id]);
        $p = Product::query()->create(['tenant_id' => $tenant->id, 'name' => 'کتاب', 'price_minor' => 200000, 'currency' => 'IRT', 'status' => 'publish', 'is_available' => true]);
        $cart = Cart::query()->create(['tenant_id' => $tenant->id, 'user_id' => $user->id]);
        CartItem::query()->create(['cart_id' => $cart->id, 'product_id' => $p->id, 'quantity' => 1]);

        AbandonedCartService::save($tenant->id, [
            'enabled' => true,
            'channels' => ['bot' => true, 'sms' => false],
            'stages' => [
                ['delay_hours' => 1, 'message' => 'سلام {name} — {total}', 'coupon_type' => 'none'],
                ['delay_hours' => 5, 'message' => 'کد {coupon}', 'coupon_type' => 'percent', 'coupon_amount' => 10],
            ],
        ]);
        $svc = app(AbandonedCartService::class);

        $this->assertSame(0, $svc->run()); // fresh cart
        $this->age($cart, 2);
        $this->assertSame(1, $svc->run());
        Http::assertSent(fn (HttpRequest $r) => ($r->data()['chat_id'] ?? '') === '42' && str_contains((string) $r->data()['text'], 'مریم — 200,000 تومان'));
        $this->assertSame(0, $svc->run()); // stage 2 not due yet

        $this->age($cart, 6);
        $cart->refresh();
        // Keep recovery_activity aligned with the aged timestamps (simulates no new customer activity).
        $meta = $cart->meta;
        $meta['recovery_activity'] = AbandonedCartService::lastActivity($cart)->toIso8601String();
        DB::table('carts')->where('id', $cart->id)->update(['meta' => json_encode($meta)]);
        $this->assertSame(1, $svc->run());
        $this->assertSame(1, Coupon::query()->where('tenant_id', $tenant->id)->count());
        $this->assertSame(2, (int) $cart->fresh()->meta['recovery_stage']);
    }

    private function age(Cart $cart, int $hours): void
    {
        $t = now()->subHours($hours);
        DB::table('carts')->where('id', $cart->id)->update(['updated_at' => $t]);
        DB::table('cart_items')->where('cart_id', $cart->id)->update(['updated_at' => $t]);
    }
}
