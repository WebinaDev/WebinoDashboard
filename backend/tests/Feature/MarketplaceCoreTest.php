<?php

namespace Tests\Feature;

use App\Models\MarketplaceJob;
use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Marketplace\Adapters\TorobAdapter;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceOrderImporter;
use App\Services\Marketplace\MarketplacePricing;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarketplaceCoreTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        TorobAdapter::$publicKeyOverride = null;
    }

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

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    public function test_hub_lists_all_platforms(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $rows = $this->getJson('/api/v1/marketplace/hub')->assertOk()->json('data.platforms') ?? $this->getJson('/api/v1/marketplace/hub')->json('data');
        $slugs = array_column($rows, 'platform');
        foreach (['basalam', 'digikala', 'snappshop', 'tapsishop', 'technolife', 'emalls', 'torob', 'zarehbin', 'snapppay-search'] as $p) {
            $this->assertContains($p, $slugs);
        }
    }

    public function test_secrets_are_masked_and_preserved(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');

        $this->postJson('/api/v1/marketplace/snappshop/settings', [
            'enabled' => true,
            'credentials' => ['vendor_id' => 'V1', 'token' => 'secret-token'],
        ])->assertOk();

        $view = $this->getJson('/api/v1/marketplace/snappshop/settings')->assertOk()->json('data');
        $this->assertTrue($view['credentials']['has_token']);
        $this->assertArrayNotHasKey('token', $view['credentials']);
        $this->assertStringNotContainsString('secret-token', json_encode($view));

        $this->postJson('/api/v1/marketplace/snappshop/settings', [
            'credentials' => ['vendor_id' => 'V2', 'token' => '••••••'],
        ])->assertOk();
        $creds = $this->settings()->credentials($this->tenant->id, 'snappshop');
        $this->assertSame('secret-token', $creds['token']);
        $this->assertSame('V2', $creds['vendor_id']);

        $this->postJson('/api/v1/marketplace/snappshop/settings', ['clear_secrets' => ['token']])->assertOk();
        $this->assertSame('', $this->settings()->credentials($this->tenant->id, 'snappshop')['token']);
    }

    public function test_snappshop_connection_and_push(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'snappshop', ['enabled' => true, 'credentials' => ['vendor_id' => 'V1', 'token' => 'tok']]);

        Http::fake([
            'apix.snappshop.ir/vendors/v1/V1/inventory/products*' => Http::response(['data' => ['data' => []]]),
            'apix.snappshop.ir/automation/v1/vendors/V1/products' => Http::response(['ok' => true]),
        ]);

        $this->postJson('/api/v1/marketplace/snappshop/test-connection')->assertOk()->assertJsonPath('data.ok', true);

        $product = $this->product();
        $this->postJson("/api/v1/marketplace/products/{$product->id}/maps", [
            'maps' => [['platform' => 'snappshop', 'remote_product_id' => 'R1', 'remote_variant_id' => 'SKU1', 'sync_enabled' => true]],
        ])->assertOk();
        $map = MarketplaceProductMap::query()->where('platform', 'snappshop')->firstOrFail();

        $this->postJson("/api/v1/marketplace/maps/{$map->id}/push")->assertOk();

        Http::assertSent(function ($req) {
            if ($req->method() !== 'PATCH') {
                return false;
            }
            $row = $req->data()['products'][0] ?? [];

            return $row['id'] === 'R1' && $row['stock'] === 7 && $row['price'] > 0 && $req->hasHeader('Authorization', 'Bearer tok');
        });
        $this->assertNull($map->fresh()->last_error);
        $this->assertNotNull($map->fresh()->last_sync_at);
    }

    public function test_technolife_push_uses_api_key_header_and_put_fallback(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'technolife', ['enabled' => true, 'credentials' => [
            'base_url' => 'https://tl.test/api', 'api_key' => 'k1', 'auth_header' => 'x-api-key',
        ]]);
        Http::fake(function ($req) {
            if ($req->method() === 'PATCH' && str_contains($req->url(), 'price')) {
                return Http::response(['message' => 'method not allowed'], 405);
            }

            return Http::response(['ok' => true]);
        });

        $product = $this->product();
        $this->postJson("/api/v1/marketplace/products/{$product->id}/maps", [
            'maps' => [['platform' => 'technolife', 'remote_product_id' => 'P9', 'remote_variant_id' => 'V9', 'sync_enabled' => true]],
        ])->assertOk();
        $map = MarketplaceProductMap::query()->where('platform', 'technolife')->firstOrFail();
        $this->postJson("/api/v1/marketplace/maps/{$map->id}/push")->assertOk();

        Http::assertSent(fn ($req) => $req->method() === 'PUT' && str_contains($req->url(), 'V9') && $req->hasHeader('X-Api-Key', 'k1'));
        Http::assertSent(fn ($req) => $req->method() === 'PATCH' && str_contains($req->url(), 'V9') && ($req->data()['stock'] ?? null) === 7);
        $this->assertNull($map->fresh()->last_error);
    }

    public function test_push_failure_keeps_remote_ids(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'snappshop', ['enabled' => true, 'credentials' => ['vendor_id' => 'V1', 'token' => 'tok']]);
        Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

        $product = $this->product();
        $map = MarketplaceProductMap::query()->create([
            'tenant_id' => $this->tenant->id, 'product_id' => $product->id, 'platform' => 'snappshop',
            'remote_product_id' => 'R1', 'sync_enabled' => true,
        ]);
        $this->postJson("/api/v1/marketplace/maps/{$map->id}/push")->assertStatus(422);
        $fresh = $map->fresh();
        $this->assertSame('R1', $fresh->remote_product_id);
        $this->assertNotNull($fresh->last_error);
    }

    public function test_tapsishop_refreshes_token_on_401(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'tapsishop', ['enabled' => true, 'credentials' => [
            'username' => 'u', 'password' => 'p', 'store_id' => '5', 'token' => 'old',
        ]]);
        $calls = 0;
        Http::fake(function ($req) use (&$calls) {
            $url = $req->url();
            if (str_contains($url, 'refresh-token')) {
                return Http::response(['data' => ['token' => 'new-token']]);
            }
            $calls++;

            return ($req->header('TapsiShop.Hub.Authorization')[0] ?? '') === 'old'
                ? Http::response(['message' => 'unauthorized'], 401)
                : Http::response(['data' => ['title' => 'My Store']]);
        });

        $res = $this->postJson('/api/v1/marketplace/tapsishop/test-connection');
        $res->assertOk();
        $this->assertNotSame('old', $this->settings()->credentials($this->tenant->id, 'tapsishop')['token']);
    }

    public function test_pricing_markup_units_rounding_and_lock(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->putJson('/api/v1/marketplace/pricing', ['platforms' => [
            'digikala' => ['enabled' => true, 'price_mode' => 'markup', 'profit_percent' => 10, 'extra_percent' => 0, 'round_to' => 1000, 'price_unit' => 'rial'],
        ]])->assertOk();

        $product = $this->product(['price_minor' => 123_456, 'purchase_price_minor' => 100_000]);
        $pricing = MarketplacePricing::forTenant($this->tenant->id);
        $price = $pricing->priceFor($product, null, 'digikala');
        $this->assertSame(0, $price % 10_000);
        $this->assertGreaterThan(100_000 * 10, $price);

        $this->assertSame(1_234_560, $pricing->priceFor($product, null, 'snappshop') * 10);

        $product->forceFill(['platform_prices' => ['digikala' => ['lock' => true, 'price' => 555_000]]])->save();
        $this->assertSame(555_000 * 10, MarketplacePricing::forTenant($this->tenant->id)->priceFor($product->fresh(), null, 'digikala'));
    }

    public function test_order_import_dedupes_and_updates_status(): void
    {
        $this->shopUser();
        $this->settings()->save($this->tenant->id, 'snappshop', ['enabled' => true, 'credentials' => ['vendor_id' => 'V1', 'token' => 'tok']]);
        $product = $this->product();
        MarketplaceProductMap::query()->create([
            'tenant_id' => $this->tenant->id, 'product_id' => $product->id, 'platform' => 'snappshop',
            'remote_product_id' => 'R1', 'remote_variant_id' => 'SKU1', 'sync_enabled' => true,
        ]);
        $adapter = MarketplaceAdapterRegistry::make('snappshop', $this->tenant->id);
        $importer = app(MarketplaceOrderImporter::class);

        $raw = [
            'id' => 'SO-1', 'status' => 'processing', 'total' => 2_000_000,
            'customer' => ['name' => 'Ali', 'mobile' => '09120000000'],
            'items' => [['product_id' => 'R1', 'sku' => 'SKU1', 'title' => 'Phone', 'quantity' => 2, 'price' => 1_000_000]],
        ];
        $importer->importOne($this->tenant->id, $adapter, $raw);
        $importer->importOne($this->tenant->id, $adapter, $raw);

        $this->assertSame(1, MarketplaceOrderMap::query()->count());
        $order = Order::query()->firstOrFail();
        $this->assertSame('snappshop', $order->sales_channel);
        $this->assertSame(5, $product->fresh()->stock);

        $importer->importOne($this->tenant->id, $adapter, array_merge($raw, ['status' => 'cancelled']));
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertSame(7, $product->fresh()->stock);
    }

    public function test_sync_now_enqueues_job_and_logs_are_listed(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->settings()->save($this->tenant->id, 'technolife', ['enabled' => true, 'credentials' => ['base_url' => 'https://tl.test', 'api_key' => 'k']]);
        Http::fake(['*' => Http::response(['ok' => true])]);

        $this->postJson('/api/v1/marketplace/technolife/sync-now')->assertOk();
        $this->assertSame(1, MarketplaceJob::query()->where('platform', 'technolife')->where('job_type', 'sync_all')->count());
        $this->getJson('/api/v1/marketplace/technolife/jobs')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/marketplace/technolife/logs')->assertOk();
    }

    // ── Feeds ───────────────────────────────────────────────────────────

    public function test_emalls_feed_validates_token_and_returns_products(): void
    {
        $this->shopUser();
        $this->settings()->save($this->tenant->id, 'emalls', ['enabled' => true]);
        $this->product();
        Http::fake(fn ($req) => Http::response(($req->data()['token'] ?? '') === 'abc' ? ['success' => true, 'message' => 'the token is valid'] : ['success' => false]));

        $res = $this->postJson('/api/v1/public/wp-json/emalls_ext/v1/products', ['token' => 'abc', 'page' => 1, 'limit' => 10], ['HTTP_HOST' => 'localhost']);
        $res->assertOk();
        $this->assertSame(1, $res->json('count'));
        $this->assertTrue($res->json('NeedSession'));
        $this->assertArrayNotHasKey('success', $res->json());

        $this->postJson('/api/v1/public/marketplace/emalls/products', ['token' => 'other'], ['HTTP_HOST' => 'localhost'])->assertStatus(401);
    }

    public function test_feed_is_hidden_when_platform_disabled(): void
    {
        $this->shopUser();
        $this->postJson('/api/v1/public/marketplace/zarehbin/products', [], ['HTTP_HOST' => 'localhost'])->assertStatus(403);
    }

    public function test_zarehbin_and_snapppay_feeds(): void
    {
        $this->shopUser();
        $this->settings()->save($this->tenant->id, 'zarehbin', ['enabled' => true]);
        $this->settings()->save($this->tenant->id, 'snapppay-search', ['enabled' => true]);
        $this->product();
        Http::fake([
            'www.zarehbin.com/*' => Http::response(['status' => 200, 'success' => true]),
            'merchants.searchwise.ir/*' => Http::response(['success' => true, 'valid' => true]),
        ]);

        $zb = $this->postJson('/api/v1/public/wp-json/zarehbin/v1/products', [], ['HTTP_HOST' => 'localhost', 'HTTP_AUTHORIZATION' => 'Bearer zt']);
        $zb->assertOk()->assertJsonPath('code', 'success')->assertJsonPath('data.count', 1);

        $sp = $this->getJson('/api/v1/public/wp-json/v1/product/feed', ['HTTP_HOST' => 'localhost', 'HTTP_X_API_KEY' => 'k']);
        $sp->assertOk()->assertJsonPath('count', 1);
    }

    // ── Torob ───────────────────────────────────────────────────────────

    protected function torobJwt(string $aud, ?int $exp = null): string
    {
        $kp = sodium_crypto_sign_keypair();
        TorobAdapter::$publicKeyOverride = base64_encode(sodium_crypto_sign_publickey($kp));
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $header = $b64(json_encode(['alg' => 'EdDSA', 'typ' => 'JWT']));
        $payload = $b64(json_encode(['aud' => $aud, 'iat' => time() - 10, 'nbf' => time() - 10, 'exp' => $exp ?? time() + 300]));
        $sig = sodium_crypto_sign_detached("$header.$payload", sodium_crypto_sign_secretkey($kp));

        return "$header.$payload.".$b64($sig);
    }

    public function test_torob_v3_requires_valid_jwt(): void
    {
        $this->shopUser();
        $this->settings()->save($this->tenant->id, 'torob', ['enabled' => true]);
        $product = $this->product();

        $this->postJson('/api/v1/public/wp-json/torob_api/v3/products', ['page' => 1, 'sort' => 'date_added_desc'], ['HTTP_HOST' => 'localhost'])
            ->assertStatus(401);

        $bad = $this->torobJwt('other.com');
        $this->postJson('/api/v1/public/wp-json/torob_api/v3/products', ['page' => 1, 'sort' => 'date_added_desc'], [
            'HTTP_HOST' => 'localhost', 'HTTP_X_TOROB_TOKEN' => $bad, 'HTTP_X_TOROB_TOKEN_VERSION' => '1',
        ])->assertStatus(401);

        $jwt = $this->torobJwt('localhost');
        $headers = ['HTTP_HOST' => 'localhost', 'HTTP_X_TOROB_TOKEN' => $jwt, 'HTTP_X_TOROB_TOKEN_VERSION' => '1'];
        $res = $this->postJson('/api/v1/public/wp-json/torob_api/v3/products', ['page' => 1, 'sort' => 'date_added_desc'], $headers);
        $res->assertOk()->assertJsonPath('api_version', 'torob_api_v3')->assertJsonPath('total', 1);
        $this->assertSame((string) $product->id, (string) $res->json('products.0.page_unique'));

        $this->postJson('/api/v1/public/wp-json/torob_api/v3/products', ['page_uniques' => [(string) $product->id]], $headers)
            ->assertOk()->assertJsonCount(1, 'products');
        $this->postJson('/api/v1/public/wp-json/torob_api/v3/products', ['page' => 1], $headers)->assertStatus(400);
    }

    public function test_torob_order_status_orders_and_set_token(): void
    {
        $this->shopUser();
        $this->settings()->save($this->tenant->id, 'torob', ['enabled' => true]);
        $product = $this->product();
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id, 'user_id' => null, 'number' => 'W-1', 'status' => 'processing',
            'total_minor' => 1_000_000, 'subtotal_minor' => 1_000_000, 'currency' => 'IRT',
            'customer_phone' => '09121112233', 'meta' => ['torob_clid' => 'clid_1', 'torob' => ['processing_stage' => 'بسته‌بندی']],
        ]);
        $order->items()->create(['product_id' => $product->id, 'quantity' => 1, 'unit_price_minor' => 1_000_000]);

        $headers = ['HTTP_HOST' => 'localhost', 'HTTP_X_TOROB_TOKEN' => $this->torobJwt('localhost'), 'HTTP_X_TOROB_TOKEN_VERSION' => '1'];

        $st = $this->getJson('/api/v1/public/wp-json/torob-api/v1/order-status?customer_phone=09121112233', $headers)->assertOk();
        $this->assertSame('PROCESSING', $st->json('orders.0.order_status'));
        $this->assertStringContainsString('بسته‌بندی', $st->json('orders.0.explanation'));
        $this->assertSame(1_000_000, $st->json('orders.0.total_amount'));

        $ts = gmdate('Y-m-d\TH:i:s\Z', time() - 3600);
        $orders = $this->getJson('/api/v1/public/wp-json/torob/v1/orders?limit=10&purchase_timestamp_gt='.$ts, $headers)->assertOk();
        $this->assertSame('clid_1', $orders->json('data.0.torob_clid'));

        $this->postJson('/api/v1/public/wp-json/torob-api/v1/set-token', ['token' => 'wh-token'], $headers)->assertOk();
        $this->assertSame('wh-token', $this->settings()->credentials($this->tenant->id, 'torob')['webhook_token']);
    }

    public function test_torob_order_tracking_editor(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id, 'number' => 'W-2', 'status' => 'shipped',
            'total_minor' => 1000, 'subtotal_minor' => 1000, 'currency' => 'IRT',
        ]);
        $this->putJson("/api/v1/marketplace/torob/orders/{$order->id}", ['tracking_code' => 'TR-9', 'carrier' => 'پست'])
            ->assertOk()->assertJsonPath('data.torob_status', 'SHIPPED');
        $this->assertSame('TR-9', $order->fresh()->meta['torob']['tracking_code']);
    }
}
