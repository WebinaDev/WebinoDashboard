<?php

namespace Tests\Feature;

use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Services\Marketplace\Basalam\BasalamAuth;
use App\Services\Marketplace\Basalam\BasalamOrders;
use App\Services\Marketplace\MarketplaceOrderImporter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BasalamTestHelpers;
use Tests\TestCase;

/**
 * v0.9.65 parity: single-flight refresh, no status regression, variation fallback.
 */
class MarketplaceBasalamParityTest extends TestCase
{
    use BasalamTestHelpers;
    use RefreshDatabase;

    public function test_refresh_is_single_flight_and_network_errors_keep_token(): void
    {
        $this->shopUser();
        $this->connect();
        config(['services.webino.basalam_oauth_base' => 'https://erp.test']);

        // Another worker holds the lock: refresh must not call ERP.
        Http::fake(['*' => Http::response(['access_token' => 'NEW', 'refresh_token' => 'RT2', 'expires_in' => 3600])]);
        $lock = Cache::lock('basalam-refresh:'.$this->tenant->id, 60);
        $this->assertTrue($lock->get());
        try {
            BasalamAuth::for($this->tenant->id)->refresh();
        } catch (\Throwable) {
        }
        Http::assertNothingSent();
        $lock->release();

        // 5xx: token kept, no auth error / reconnect flag.
        Http::fake(['*' => Http::response('gateway', 502)]);
        try {
            BasalamAuth::for($this->tenant->id)->refresh();
            $this->fail('expected exception');
        } catch (\Throwable) {
        }
        $creds = $this->settings()->credentials($this->tenant->id, 'basalam');
        $this->assertSame('AT', $creds['access_token']);
        $this->assertSame('RT', $creds['refresh_token']);
        $state = $this->settings()->state($this->tenant->id, 'basalam');
        $this->assertEmpty($state['auth_error'] ?? null);
        $this->assertEmpty($state['needs_reconnect'] ?? null);

        // 400: refresh token rejected → needs reconnect.
        Http::fake(['*' => Http::response(['message' => 'invalid_grant'], 400)]);
        try {
            BasalamAuth::for($this->tenant->id)->refresh();
        } catch (\Throwable) {
        }
        $this->assertTrue((bool) $this->settings()->state($this->tenant->id, 'basalam')['needs_reconnect']);

        // Success clears the flag.
        Http::fake(['*' => Http::response(['access_token' => 'NEW', 'refresh_token' => 'RT2', 'expires_in' => 3600])]);
        BasalamAuth::for($this->tenant->id)->refresh();
        $this->assertSame('NEW', $this->settings()->credentials($this->tenant->id, 'basalam')['access_token']);
        $this->assertEmpty($this->settings()->state($this->tenant->id, 'basalam')['needs_reconnect'] ?? null);
    }

    public function test_shipped_order_never_regresses(): void
    {
        $this->shopUser();
        $this->connect();
        Http::fake([
            'order-processing.basalam.com/v2/vendors/77/orders/5001' => Http::response(['data' => $this->invoice()]),
            '*' => Http::response(['data' => []]),
        ]);
        $result = BasalamOrders::for($this->tenant->id)->handleEvent(['event_id' => 5, 'invoice_id' => 5001]);
        $order = Order::query()->findOrFail($result['order_id']);
        $order->update(['status' => 'shipped']);
        $map = MarketplaceOrderMap::query()->where('order_id', $order->id)->firstOrFail();

        $importer = app(MarketplaceOrderImporter::class);
        foreach (['processing', 'on_hold', 'pending'] as $to) {
            $importer->updateStatus($map->fresh(), 'regress-'.$to, $to);
            $this->assertSame('shipped', $order->fresh()->status, "shipped -> {$to} must be ignored");
        }
        $this->assertSame(1, MarketplaceOrderMap::query()->where('platform', 'basalam')->count(), 'no duplicate per invoice');
    }

    public function test_variation_falls_back_to_parent_only_when_not_variable(): void
    {
        $this->shopUser();
        $importer = app(MarketplaceOrderImporter::class);

        $simple = $this->product(['slug' => 's1', 'sku' => 'S1', 'type' => 'simple']);
        MarketplaceProductMap::query()->create(['tenant_id' => $this->tenant->id, 'platform' => 'basalam', 'product_id' => $simple->id, 'remote_product_id' => '100']);
        $hit = $importer->findProductMap($this->tenant->id, 'basalam', '100', '555');
        $this->assertNotNull($hit);
        $this->assertSame($simple->id, $hit->product_id);

        $variable = $this->product(['slug' => 'v1', 'sku' => 'V1', 'type' => 'variable']);
        MarketplaceProductMap::query()->create(['tenant_id' => $this->tenant->id, 'platform' => 'basalam', 'product_id' => $variable->id, 'remote_product_id' => '200']);
        $this->assertNull($importer->findProductMap($this->tenant->id, 'basalam', '200', '777'));
        $this->assertNotNull($importer->findProductMap($this->tenant->id, 'basalam', '200', ''));
    }
}
