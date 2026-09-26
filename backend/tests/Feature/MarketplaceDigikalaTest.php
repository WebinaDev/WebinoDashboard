<?php

namespace Tests\Feature;

use App\Models\MarketplaceJob;
use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Marketplace\Digikala\DigikalaAuth;
use App\Services\Marketplace\Digikala\DigikalaWebhooks;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceOrderImporter;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarketplaceDigikalaTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function shopUser(): User
    {
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'localhost',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'commerce.variants' => true,
            'commerce.pricing' => true,
            'commerce.marketplace' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        return $user;
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    protected function connect(array $credentials = [], bool $autoSync = false): void
    {
        $this->settings()->save($this->tenant->id, 'digikala', [
            'enabled' => true,
            'auto_sync' => $autoSync,
            'credentials' => array_merge(['client_code' => 'C1'], $credentials),
        ]);
        $this->settings()->putState($this->tenant->id, 'digikala', [
            'access_token' => 'AT',
            'refresh_token' => 'RT',
            'access_expires_at' => time() + 3600,
            'refresh_expires_at' => time() + 86400,
        ]);
        Cache::flush();
    }

    protected function product(array $attrs = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Phone',
            'slug' => 'phone',
            'sku' => 'PH-1',
            'price_minor' => 1_000_000,
            'currency' => 'IRT',
            'stock' => 7,
            'manage_stock' => true,
            'status' => 'publish',
            'type' => 'simple',
        ], $attrs));
    }

    /** @param  array<string, mixed>  $bundle */
    protected function importBundle(array $bundle): Order
    {
        $adapter = MarketplaceAdapterRegistry::make('digikala', $this->tenant->id);
        app(MarketplaceOrderImporter::class)->importOne($this->tenant->id, $adapter, $bundle);

        return MarketplaceOrderMap::query()->where('remote_order_id', $bundle['id'])->firstOrFail()->order;
    }

    public function test_keys_generation_and_token_issue_from_encrypted_code(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'digikala', ['enabled' => true, 'credentials' => ['client_code' => 'C1']]);

        $public = DigikalaAuth::for($this->tenant->id)->generateKeypair(2048);
        $this->assertStringContainsString('BEGIN PUBLIC KEY', $public);
        $view = $this->getJson('/api/v1/marketplace/digikala/settings')->assertOk()->json('data.credentials');
        $this->assertTrue($view['has_private_key']);
        $this->assertArrayNotHasKey('private_key', $view);

        openssl_public_encrypt('AUTH-CODE-1', $cipher, $public, OPENSSL_PKCS1_PADDING);
        Http::fake(fn (HttpRequest $req) => str_contains($req->url(), 'open-api/v1/auth/token') && ($req->data()['authorization_code'] ?? '') === 'AUTH-CODE-1'
            ? Http::response(['data' => ['access_token' => 'AT1', 'refresh_token' => 'RT1', 'expires_in' => 3600]])
            : Http::response(['message' => 'bad'], 400));

        $this->postJson('/api/v1/marketplace/digikala/token/issue', ['encrypted_code' => chunk_split(base64_encode($cipher), 40)])
            ->assertOk()
            ->assertJsonPath('data.auth.connected', true);

        $state = $this->settings()->state($this->tenant->id, 'digikala');
        $this->assertSame('AT1', $state['access_token']);
        $this->assertSame('RT1', $state['refresh_token']);
        $this->assertGreaterThan(time() + 3000, $state['access_expires_at']);
        $this->assertSame('', $this->settings()->credentials($this->tenant->id, 'digikala')['encrypted_code']);

        $this->postJson('/api/v1/marketplace/digikala/token/issue', ['encrypted_code' => base64_encode('garbage')])->assertStatus(422);
    }

    public function test_expiry_parsing_supports_ms_objects_and_strings(): void
    {
        $this->assertSame(1_900_000_000, DigikalaAuth::parseExpiry(1_900_000_000_000));
        $this->assertSame(1_900_000_000, DigikalaAuth::parseExpiry('1900000000'));
        $ts = DigikalaAuth::parseExpiry(['date' => '2030-01-01 00:00:00.000000', 'timezone' => 'Asia/Tehran']);
        $this->assertSame((new \DateTimeImmutable('2030-01-01 00:00:00', new \DateTimeZone('Asia/Tehran')))->getTimestamp(), $ts);
        $this->assertSame(0, DigikalaAuth::parseExpiry(null));
    }

    public function test_expired_access_token_is_refreshed_and_401_is_retried(): void
    {
        $this->shopUser();
        $this->connect();
        $this->settings()->putState($this->tenant->id, 'digikala', ['access_expires_at' => time() + 10]);

        $variantCalls = 0;
        Http::fake(function (HttpRequest $req) use (&$variantCalls) {
            if (str_contains($req->url(), 'auth/refresh-token')) {
                return Http::response(['data' => ['access_token' => 'AT2', 'refresh_token' => 'RT2', 'expires_in' => 3600]]);
            }
            if (str_contains($req->url(), 'open-api/v1/variants')) {
                $variantCalls++;
                if ($variantCalls === 1) {
                    return Http::response(['message' => 'expired'], 401);
                }

                return Http::response(['data' => ['items' => [['id' => 11, 'product_id' => 22, 'product_title' => 'Phone', 'selling_price' => 5000, 'seller_stock' => 3, 'supplier_code' => 'PH-1']]]]);
            }

            return Http::response([], 404);
        });

        $rows = MarketplaceAdapterRegistry::make('digikala', $this->tenant->id)->searchProducts('Phone');
        $this->assertSame('11', $rows[0]['variant_id']);
        $this->assertSame('22', $rows[0]['id']);
        $this->assertSame('PH-1', $rows[0]['sku']);
        $this->assertSame(2, $variantCalls);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), 'auth/refresh-token') && $r->data() == ['access_token' => 'AT', 'refresh_token' => 'RT']);
        $this->assertSame('RT2', $this->settings()->state($this->tenant->id, 'digikala')['refresh_token']);
    }

    public function test_price_and_stock_push_with_batch_fallback(): void
    {
        $this->shopUser();
        $this->connect(['credit_increase_percentage' => 3]);
        $product = $this->product();
        $map = MarketplaceProductMap::query()->create([
            'tenant_id' => $this->tenant->id, 'product_id' => $product->id, 'platform' => 'digikala',
            'remote_product_id' => '22', 'remote_variant_id' => '555', 'sync_enabled' => true,
        ]);
        Http::fake([
            '*/variants/selling-price' => Http::response(['message' => 'down'], 500),
            '*/batch/variant/update' => Http::response(['status' => 'ok']),
            '*/batch/variant/seller-stock/update' => Http::response(['status' => 'ok']),
        ]);

        $result = app(MarketplaceSync::class)->pushMap($map->id);
        $this->assertSame(10_000_000, $result['price']);

        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'PATCH' && $r->data() == ['variant_id' => 555, 'selling_price' => 10_000_000, 'credit_increase_percentage' => 3]
            && $r->header('Authorization')[0] === 'Bearer AT');
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), 'batch/variant/update') && $r['items'][0]['payload']['selling_price'] === 10_000_000);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), 'seller-stock/update') && $r['items'][0] == ['variant_id' => 555, 'payload' => ['seller_stock' => 7]]);
        $this->assertNull($map->fresh()->last_error);
    }

    public function test_orders_import_active_history_and_sbs_with_dedupe(): void
    {
        $this->shopUser();
        $this->connect();
        $product = $this->product();
        MarketplaceProductMap::query()->create([
            'tenant_id' => $this->tenant->id, 'product_id' => $product->id, 'platform' => 'digikala',
            'remote_product_id' => '22', 'remote_variant_id' => '555', 'sync_enabled' => true,
        ]);
        $canceled = false;
        Http::fake(function (HttpRequest $req) use (&$canceled) {
            $url = $req->url();
            parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
            $page = (int) ($q['page'] ?? 1);
            if (str_contains($url, 'ship-by-seller-orders')) {
                return Http::response(['data' => ['items' => $page > 1 ? [] : [
                    ['id' => 77, 'order_id' => 9003, 'status' => 'processing', 'order_items' => [['id' => 501, 'order_id' => 9003, 'product_variant_id' => 555, 'quantity' => 1, 'selling_price' => 9_000_000]]],
                ]]]);
            }
            if (str_contains($url, 'orders/history')) {
                $type = $q['order_type'] ?? '';
                $items = match (true) {
                    $page > 1 => [],
                    $type === 'processed' => [['id' => 401, 'order_id' => 9002, 'product_variant_id' => 999, 'product_variant_title' => 'Other', 'quantity' => 1, 'selling_price' => 50_000]],
                    $type === 'canceled' && $canceled => [['id' => 301, 'order_id' => 9001, 'product_variant_id' => 555, 'quantity' => 2, 'selling_price' => 10_000_000]],
                    default => [],
                };

                return Http::response(['data' => ['items' => $items]]);
            }
            if (str_contains($url, 'open-api/v1/orders')) {
                return Http::response(['data' => ['items' => $page > 1 || $canceled ? [] : [
                    ['id' => 301, 'order_id' => 9001, 'product_variant_id' => 555, 'quantity' => 2, 'selling_price' => 10_000_000],
                ]]]);
            }

            return Http::response([], 404);
        });

        $sync = app(MarketplaceSync::class);
        $stats = $sync->pullOrders($this->tenant->id, 'digikala');
        $this->assertSame(3, $stats['created']);

        $active = MarketplaceOrderMap::query()->where('remote_order_id', '9001')->firstOrFail();
        $this->assertSame('processing', $active->order->status);
        $this->assertSame(1_000_000, $active->order->items()->first()->unit_price_minor);
        $this->assertSame(4, $product->fresh()->stock);

        $history = MarketplaceOrderMap::query()->where('remote_order_id', '9002')->firstOrFail();
        $this->assertSame('completed', $history->order->status);

        $sbs = MarketplaceOrderMap::query()->where('remote_order_id', '9003')->firstOrFail();
        $this->assertSame('seller', $sbs->fulfillment);
        $this->assertSame('77', $sbs->order->meta['digikala']['shipment_id']);
        $this->assertSame('seller', $sbs->order->meta['digikala']['fulfillment']);

        $stats = $sync->pullOrders($this->tenant->id, 'digikala');
        $this->assertSame(0, $stats['created']);
        $this->assertSame(3, MarketplaceOrderMap::query()->count());

        $canceled = true;
        $sync->pullOrders($this->tenant->id, 'digikala');
        $this->assertSame('cancelled', $active->fresh()->order->status);
        $this->assertSame('canceled', $active->fresh()->status);
        $this->assertSame(6, $product->fresh()->stock);
    }

    public function test_sbs_status_and_cancel_actions(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();
        Http::fake(['*' => Http::response(['status' => 'ok'])]);

        $sbsOrder = $this->importBundle([
            'id' => '9003', 'fulfillment' => 'seller', 'native_status' => 'processing', 'shipment_id' => '77', 'sbs' => [],
            'items' => [['id' => 501, 'order_id' => 9003, 'product_variant_id' => 555, 'quantity' => 1, 'selling_price' => 90_000]],
        ]);
        $warehouseOrder = $this->importBundle([
            'id' => '9001', 'fulfillment' => 'digikala', 'native_status' => 'active', 'shipment_id' => '', 'sbs' => [],
            'items' => [['id' => 301, 'order_id' => 9001, 'product_variant_id' => 555, 'quantity' => 2, 'selling_price' => 90_000]],
        ]);

        $this->getJson("/api/v1/marketplace/digikala/orders/{$sbsOrder->id}")->assertOk()
            ->assertJsonPath('data.fulfillment', 'seller')
            ->assertJsonPath('data.shipment_id', '77');

        $this->postJson("/api/v1/marketplace/digikala/orders/{$sbsOrder->id}/sbs-status", ['action' => 'processed', 'verification_code' => '1234'])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'PUT' && str_ends_with($r->url(), 'ship-by-seller-orders/update-status')
            && $r->data() == ['order_shipment_id' => 77, 'new_status' => 'processed', 'verification_code' => 1234]);
        $this->assertSame('processed', $sbsOrder->fresh()->meta['digikala']['native_status']);

        $this->postJson("/api/v1/marketplace/digikala/orders/{$warehouseOrder->id}/sbs-status", ['action' => 'processed'])->assertStatus(400);
        $this->postJson("/api/v1/marketplace/digikala/orders/{$sbsOrder->id}/sbs-status", ['action' => 'shipped'])->assertStatus(422);

        $this->postJson("/api/v1/marketplace/digikala/orders/{$warehouseOrder->id}/cancel", ['cancellation_reason_id' => 4])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'DELETE' && str_ends_with($r->url(), 'open-api/v1/orders/301') && $r['cancellation_reason_id'] === 4);

        $this->postJson("/api/v1/marketplace/digikala/orders/{$sbsOrder->id}/cancel", ['count' => 1])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), 'ship-by-seller-orders/cancel-item')
            && $r->data() == ['order_shipment_id' => 77, 'item_id' => 501, 'reason_id' => 1, 'count' => 1]);

        $this->assertSame(0, MarketplaceJob::query()->where('status', 'failed')->count());
    }

    public function test_local_status_change_is_pushed_when_auto_sync_is_on(): void
    {
        $this->shopUser();
        $this->connect([], true);
        Http::fake(['*' => Http::response(['status' => 'ok'])]);
        $order = $this->importBundle([
            'id' => '9003', 'fulfillment' => 'seller', 'native_status' => 'processing', 'shipment_id' => '77', 'sbs' => [],
            'items' => [['id' => 501, 'order_id' => 9003, 'product_variant_id' => 555, 'quantity' => 1, 'selling_price' => 90_000]],
        ]);
        Http::assertNothingSent();

        $order->update(['status' => 'completed']);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), 'update-status') && $r['new_status'] === 'full_delivered_to_customer');

        $order->fresh()->update(['status' => 'on_hold']);
        $this->assertSame('done', MarketplaceJob::query()->latest('id')->first()->status);
    }

    public function test_webhook_signature_and_event_routing(): void
    {
        $this->shopUser();
        $this->connect(['webhook_secret' => 'whsec', 'webhook_events' => ['order_finalized' => true, 'commission' => false]]);
        Http::fake(['*' => Http::response(['data' => ['items' => []]])]);

        $send = function (array $payload, ?string $secret) {
            $body = json_encode($payload);
            $headers = ['HTTP_HOST' => 'localhost', 'CONTENT_TYPE' => 'application/json'];
            if ($secret !== null) {
                $headers['HTTP_X_DIGIKALA_SIGNATURE'] = hash_hmac('sha256', $body, $secret);
            }

            return $this->call('POST', '/api/v1/public/marketplace/digikala/webhook', [], [], [], $headers, $body);
        };

        $send(['event' => 'order.created', 'data' => ['order_id' => 1]], 'wrong')->assertStatus(403);
        $send(['event' => 'order.created', 'data' => ['order_id' => 1]], null)->assertStatus(403);

        $send(['event' => 'order.created', 'data' => ['order_id' => 1]], 'whsec')->assertOk()
            ->assertJsonPath('event', 'order_finalized')
            ->assertJsonPath('queued', true);
        $this->assertSame(1, MarketplaceJob::query()->where('platform', 'digikala')->where('job_type', MarketplaceSync::PULL_ORDERS)->count());

        $send(['type' => 'commission_change'], 'whsec')->assertOk()->assertJsonPath('queued', false);
        $send(['event' => 'something_else'], 'whsec')->assertOk()->assertJsonPath('queued', false);

        $this->assertSame('variant_status', DigikalaWebhooks::resolveEventKey('Product-Variant-Status-Change'));
        $this->assertSame('order_item_cancelled', DigikalaWebhooks::resolveEventKey('order_item_cancelled'));
        $this->assertCount(12, DigikalaWebhooks::MATRIX);
    }

    public function test_dkp_mapping_with_public_labels_and_webhook_subscription(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();
        $product = $this->product();
        Http::fake(function (HttpRequest $req) {
            $url = $req->url();
            if (str_contains($url, 'api.digikala.com/v2/product/22')) {
                return Http::response(['data' => ['product' => ['title_fa' => 'گوشی', 'variants' => [
                    ['id' => 555, 'color' => ['title' => 'مشکی']],
                    ['id' => 556, 'color' => ['title' => 'سفید'], 'size' => ['title' => 'L']],
                ]]]]);
            }
            if (str_contains($url, 'open-api/v1/variants')) {
                return Http::response(['data' => ['items' => [
                    ['id' => 555, 'product_id' => 22, 'product_title' => 'Phone'],
                    ['id' => 556, 'product_id' => 22, 'product_title' => 'Phone'],
                ]]]);
            }
            if (str_contains($url, 'webhook/event-types')) {
                return Http::response(['data' => ['order_shipment', 'commission_change']]);
            }
            if (str_contains($url, 'webhook/subscription')) {
                return Http::response(['data' => ['id' => 1]]);
            }

            return Http::response([], 404);
        });

        $res = $this->postJson("/api/v1/marketplace/digikala/products/{$product->id}/map", ['dkp' => 'dkp-22'])->assertOk();
        $res->assertJsonPath('data.needs_variant', true)->assertJsonPath('data.variants.1.label', 'سفید · L');
        $this->assertNull(MarketplaceProductMap::query()->firstOrFail()->remote_variant_id);

        $this->postJson("/api/v1/marketplace/digikala/products/{$product->id}/map", ['dkp' => 'DKP-22', 'variant_id' => '556'])
            ->assertOk()->assertJsonPath('data.needs_variant', false);
        $map = MarketplaceProductMap::query()->firstOrFail();
        $this->assertSame('556', $map->remote_variant_id);
        $this->assertTrue($map->sync_enabled);

        $this->getJson("/api/v1/marketplace/digikala/products/{$product->id}/labels")->assertOk()->assertJsonPath('data.556.label', 'سفید · L');

        $this->postJson('/api/v1/marketplace/digikala/webhook/subscribe')->assertOk();
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), 'webhook/subscription')
            && $r['url'] === 'https://localhost/api/v1/public/marketplace/digikala/webhook'
            && in_array('order_shipment', $r['events'], true));

        $this->getJson('/api/v1/marketplace/digikala/overview')->assertOk()
            ->assertJsonPath('data.auth.connected', true)
            ->assertJsonCount(12, 'data.webhook_matrix');
        $this->getJson('/api/v1/marketplace/digikala/health')->assertOk()->assertJsonPath('data.auth_ok', true);
    }
}
