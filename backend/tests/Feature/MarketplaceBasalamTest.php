<?php

namespace Tests\Feature;

use App\Models\MarketplaceJob;
use App\Models\MarketplaceOrderMap;
use App\Models\MarketplaceProductMap;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Marketplace\Adapters\BasalamAdapter;
use App\Services\Marketplace\Basalam\BasalamEndpoints;
use App\Services\Marketplace\Basalam\BasalamOrders;
use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Marketplace\Basalam\BasalamSettings;
use App\Services\Marketplace\MarketplaceAdapterRegistry;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarketplaceBasalamTest extends TestCase
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
            'commerce.payments' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        return $user;
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    protected function connect(array $credentials = []): void
    {
        $this->settings()->save($this->tenant->id, 'basalam', [
            'enabled' => true,
            'credentials' => array_merge([
                'access_token' => 'AT',
                'refresh_token' => 'RT',
                'vendor_id' => '77',
                'webhook_token' => 'whtok',
            ], $credentials),
        ]);
        $this->settings()->putState($this->tenant->id, 'basalam', ['expires_at' => time() + 86400, 'is_vendor' => true]);
        Cache::flush();
    }

    protected function product(array $attrs = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Handmade bag',
            'slug' => 'bag',
            'sku' => 'BAG-1',
            'price_minor' => 250_000,
            'currency' => 'IRT',
            'stock' => 4,
            'manage_stock' => true,
            'status' => 'publish',
            'type' => 'simple',
            'weight' => 500,
            'description' => 'A handmade leather bag.',
            'meta' => ['marketplace' => ['basalam' => ['category_ids' => [10, 20, 30], 'preparation_days' => 2]]],
        ], $attrs));
    }

    /** @return array<string, mixed> */
    protected function invoice(int $id = 5001, int $statusId = BasalamEndpoints::STATUS_WAIT_VENDOR): array
    {
        return [
            'id' => $id,
            'hash_id' => 'H'.$id,
            'status' => ['id' => $statusId],
            'items' => [[
                'id' => 1,
                'quantity' => 2,
                'product' => ['id' => 9001, 'title' => 'Handmade bag', 'price' => 2_500_000],
                'financial_report' => ['report_items' => [['title' => 'قیمت محصول', 'amount' => 5_000_000]]],
            ]],
            'customer_data' => [
                'recipient' => ['name' => 'Ali Rezaei', 'mobile' => '09120000000', 'postal_address' => 'Tehran', 'postal_code' => '1234567890'],
                'city' => ['id' => 1, 'title' => 'Tehran', 'parent' => ['id' => 2, 'title' => 'Tehran']],
            ],
            'financial_report' => ['shipping_submit' => ['total' => ['amount' => 300_000]]],
        ];
    }

    public function test_status_settings_and_product_meta_endpoints(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();

        $this->getJson('/api/v1/marketplace/basalam/status')->assertOk()->assertJsonPath('data.auth.connected', true);

        $this->postJson('/api/v1/marketplace/basalam/settings', ['settings' => ['default_weight' => 750, 'round_price' => 'up']])->assertOk();
        $this->assertSame(750, app(BasalamSettings::class)->engine($this->tenant->id)['default_weight']);

        $product = $this->product();
        $this->putJson("/api/v1/marketplace/basalam/products/{$product->id}/meta", [
            'unit_type' => 6305,
            'price_change' => '10%',
            'is_gold' => true,
            'gold' => ['purity' => '18', 'weight' => '3.5'],
            'category_ids' => [1, 2, 3, 4],
        ])->assertStatus(422);
        $this->putJson("/api/v1/marketplace/basalam/products/{$product->id}/meta", [
            'unit_type' => 6305,
            'price_change' => '10%',
            'is_gold' => true,
            'gold' => ['purity' => '18', 'weight' => '3.5'],
            'video_url' => '',
        ])->assertOk();
        $meta = $product->fresh()->meta['marketplace']['basalam'];
        $this->assertSame(6305, $meta['unit_type']);
        $this->assertArrayNotHasKey('video_url', $meta);
        $this->assertSame('18', $meta['gold']['purity']);
    }

    public function test_product_create_update_and_price_stock_push(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();
        $product = $this->product(['image_url' => 'https://cdn.example.com/bag.jpg']);

        Http::fake([
            'cdn.example.com/*' => Http::response('JPEGDATA', 200, ['Content-Type' => 'image/jpeg']),
            'uploadio.basalam.com/v3/media/upload-request' => Http::response([
                'file_id' => 'F1', 'upload_strategy' => 'presigned_post',
                'staging' => ['url' => 'https://s3.example.com/up', 'fields' => ['key' => 'k1']],
            ]),
            's3.example.com/*' => Http::response('', 204),
            'uploadio.basalam.com/v3/media/complete' => Http::response(['data' => ['id' => 555, 'status' => 'ready', 'urls' => ['primary' => 'https://img.basalam.com/555.jpg']]]),
            'openapi.basalam.com/v1/vendors/77/products' => Http::response(['id' => 9001, 'status' => ['id' => 2976]], 201),
            'openapi.basalam.com/v1/products/9001' => Http::response(['id' => 9001]),
            '*' => Http::response(['data' => []]),
        ]);

        $this->postJson('/api/v1/marketplace/basalam/sync/products/create', ['product_id' => $product->id, 'now' => true])->assertOk();
        $map = MarketplaceProductMap::query()->where('platform', 'basalam')->where('product_id', $product->id)->first();
        $this->assertNotNull($map);
        $this->assertSame('9001', (string) $map->remote_product_id);

        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/v1/vendors/77/products')
            && $r->hasHeader('Authorization', 'Bearer AT') && (int) ($r->data()['photo'] ?? 0) === 555);

        $this->postJson('/api/v1/marketplace/basalam/sync/products/create', ['product_id' => $product->id, 'now' => true])->assertStatus(422);

        /** @var BasalamAdapter $adapter */
        $adapter = MarketplaceAdapterRegistry::make('basalam', $this->tenant->id);
        [$price, $stock] = $adapter->priceStockFor($map->fresh());
        $this->assertSame(4, $stock);
        $this->assertGreaterThan(0, $price);
        $adapter->pushPriceStock($map->fresh(), $price, $stock);
        Http::assertSent(fn (HttpRequest $r) => in_array($r->method(), ['PATCH', 'PUT'], true) && str_ends_with($r->url(), '/v1/products/9001')
            && (int) ($r->data()['stock'] ?? -1) === 4);

        $list = $this->getJson('/api/v1/marketplace/basalam/products?filter=connected')->assertOk()->json('data');
        $this->assertSame(1, $list['total']);
        $this->assertTrue($list['products'][0]['connected']);

        $this->postJson('/api/v1/marketplace/basalam/sync/products/disconnect', ['product_id' => $product->id])->assertOk();
        $this->assertSame(0, MarketplaceProductMap::query()->where('platform', 'basalam')->whereNotNull('remote_product_id')->count());
    }

    public function test_webhook_token_and_event_queue(): void
    {
        $this->shopUser();
        $this->connect();
        Http::fake(['*' => Http::response(['data' => []])]);

        $send = fn (array $payload, ?string $token, string $path = '/api/v1/public/marketplace/basalam/webhook') => $this->call(
            'POST', $path, [], [], [],
            array_filter(['HTTP_HOST' => 'localhost', 'CONTENT_TYPE' => 'application/json', 'HTTP_TOKEN' => $token]),
            json_encode($payload)
        );

        $send(['event_id' => 5, 'invoice_id' => 5001], 'wrong')->assertStatus(403);
        $send(['event_id' => 5, 'invoice_id' => 5001], null)->assertStatus(403);

        $send(['event_id' => 5, 'invoice_id' => 5001], 'whtok')->assertOk()->assertJsonPath('message', 'Order sync is disabled.');
        $this->assertSame(0, MarketplaceJob::query()->where('platform', 'basalam')->count());

        app(BasalamSettings::class)->saveEngine($this->tenant->id, ['sync_status_order' => true]);
        $send(['event_id' => 5, 'invoice_id' => 5001], 'whtok')->assertOk();
        $send(['event_id' => 5, 'invoice_id' => 5001], 'whtok', '/api/v1/public/wp-json/webino-basalam/v1/order-manager')->assertOk();
        $queued = MarketplaceJob::query()->where('platform', 'basalam')->where('job_type', BasalamOrders::JOB_EVENT)->count();
        $this->assertGreaterThanOrEqual(1, $queued);

        app(BasalamSettings::class)->saveEngine($this->tenant->id, ['sync_status_order' => false]);
        $send(['event_id' => 5, 'invoice_id' => 5002], 'whtok')->assertOk();
        $this->assertSame($queued, MarketplaceJob::query()->where('platform', 'basalam')->where('job_type', BasalamOrders::JOB_EVENT)->count());
    }

    public function test_order_import_status_events_and_actions(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();
        Http::fake([
            'order-processing.basalam.com/v2/vendors/77/orders/5001' => Http::response(['data' => $this->invoice()]),
            'order-processing.basalam.com/v1/vendor/set-preparation-order' => Http::response(['ok' => true]),
            'order-processing.basalam.com/v2/vendor/set-posted-order' => Http::response(['ok' => true]),
            '*' => Http::response(['data' => []]),
        ]);

        $orders = BasalamOrders::for($this->tenant->id);
        $result = $orders->handleEvent(['event_id' => 5, 'invoice_id' => 5001, 'payment_id' => 'P1']);
        $this->assertSame('created', $result['result']);
        $order = Order::query()->findOrFail($result['order_id']);
        $this->assertSame('on_hold', $order->status);
        $this->assertSame('bslm-wait-vendor', $order->meta['basalam']['status_key']);
        $this->assertSame('P1', $order->meta['basalam']['customer']['payment_id']);
        $this->assertSame(30_000, (int) $order->shipping_minor);

        $this->assertSame('exists', $orders->handleEvent(['event_id' => 5, 'invoice_id' => 5001])['result']);
        $this->assertSame(1, MarketplaceOrderMap::query()->where('platform', 'basalam')->count());

        $info = $this->getJson("/api/v1/marketplace/basalam/orders/{$order->id}")->assertOk()->json('data');
        $this->assertSame(5001, $info['invoice_id']);
        $this->assertArrayHasKey('3481', $info['cancel_reasons']);

        $this->postJson("/api/v1/marketplace/basalam/orders/{$order->id}/confirm")->assertOk();
        $this->assertSame('processing', $order->fresh()->status);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/v1/vendor/set-preparation-order') && (int) ($r->data()['order_id'] ?? 0) === 5001);

        $this->postJson("/api/v1/marketplace/basalam/orders/{$order->id}/tracking", ['tracking_code' => '', 'phone' => '0912'])->assertStatus(422);
        $this->postJson("/api/v1/marketplace/basalam/orders/{$order->id}/tracking", ['tracking_code' => 'TRK1', 'phone' => '09120000000', 'shipping_method' => 4040])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/v2/vendor/set-posted-order'));

        $orders->handleEvent(['event_id' => 3, 'status' => BasalamEndpoints::STATUS_COMPLETED, 'more_data' => ['invoice_id' => 5001]]);
        $this->assertSame('completed', $order->fresh()->status);
        $orders->handleEvent(['event_id' => 7, 'invoice_id' => 5001, 'type' => 'cancelled']);
        $this->assertSame('cancelled', $order->fresh()->status);

        $this->assertSame(1, $this->getJson('/api/v1/marketplace/basalam/orders')->assertOk()->json('data.total'));
    }

    public function test_plugin_status_endpoint_token_rules(): void
    {
        $this->shopUser();
        $this->connect();
        Http::fake([
            'api.hamsalam.ir/*' => fn (HttpRequest $r) => str_contains($r->url(), 'token=remote-ok')
                ? Http::response(['success' => true])
                : Http::response(['success' => false], 403),
            '*' => Http::response(['data' => []]),
        ]);
        $get = fn (?string $token) => $this->call('GET', '/api/v1/public/marketplace/basalam/plugin-status'.($token !== null ? '?token='.$token : ''), [], [], [], ['HTTP_HOST' => 'localhost']);

        $get(null)->assertStatus(403)->assertJsonPath('code', 'webino_basalam_missing_status_token');
        $get('nope')->assertStatus(403)->assertJsonPath('code', 'webino_basalam_invalid_status_token');

        $get('remote-ok')->assertOk();
        $res = $get('whtok')->assertOk();
        $this->assertSame('webino', $res->json('platform'));
        $this->assertArrayHasKey('category_mapping_list', $res->json());
        $this->assertArrayNotHasKey('access_token', (array) $res->json('settings'));
        $this->assertArrayNotHasKey('webhook_token', (array) $res->json('settings'));
    }

    public function test_basalam_pay_create_and_verify(): void
    {
        $this->shopUser();
        $this->connect(['gateway_secret' => 'gsec']);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'WD-1',
            'status' => 'pending_payment',
            'currency' => 'IRT',
            'subtotal_minor' => 500,
            'total_minor' => 500,
        ]);
        Http::fake([
            'openapi.basalam.com/v1/pay/pre-transactions' => Http::response(['hash_id' => 'HX1', 'pay_url' => 'https://pay.basalam.com/HX1']),
            'openapi.basalam.com/v1/pay/transactions/HX1/inquiry' => Http::response(['status' => ['slug' => 'unverified']]),
            'openapi.basalam.com/v1/pay/transactions/HX1/verify' => Http::response(['status' => ['slug' => 'success']]),
        ]);

        $pay = BasalamPay::for($this->tenant->id);
        $this->assertTrue($pay->configured());
        $this->assertSame(BasalamPay::MIN_AMOUNT_RIAL, $pay->amountRial($order));

        $intent = $pay->createIntent($order);
        $this->assertSame('https://pay.basalam.com/HX1', $intent->redirect_url);
        $this->assertSame($intent->id, $pay->createIntent($order)->id);
        Http::assertSentCount(1);
        Http::assertSent(fn (HttpRequest $r) => $r->hasHeader('X-Gateway-Secret', 'gsec') && (int) $r->data()['amount'] === 10000);

        $result = $pay->verify($order);
        $this->assertTrue($result['paid']);
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('HX1', $order->fresh()->payment_ref);
        $this->assertSame('completed', PaymentIntent::query()->find($intent->id)->status);
    }

    public function test_pay_requires_secret_unless_sandbox(): void
    {
        $this->shopUser();
        $this->connect();
        $pay = BasalamPay::for($this->tenant->id);
        $this->assertFalse($pay->configured());

        app(BasalamSettings::class)->saveGateway($this->tenant->id, ['gateway_sandbox' => true]);
        Http::fake(['*' => Http::response(['hash_id' => 'S1', 'pay_url' => 'https://pay.basalam.com/S1'])]);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id, 'number' => 'WD-2', 'status' => 'pending_payment', 'currency' => 'IRR',
            'subtotal_minor' => 150_000, 'total_minor' => 150_000,
        ]);
        $this->assertTrue($pay->configured());
        $pay->createIntent($order);
        Http::assertSent(fn (HttpRequest $r) => $r->hasHeader('x-sandbox', 'demo-team-1') && (int) $r->data()['amount'] === 150_000);
    }

    public function test_health_alerts_and_credentials_are_masked(): void
    {
        $this->actingAs($this->shopUser(), 'sanctum');
        $this->connect();

        $alerts = collect(BasalamAdapter::alertsFor([
            'auth_ok' => false,
            'circuit' => ['state' => 'open'],
            'errors_24h' => 50,
            'queue_pending' => 500,
            'duplicates' => 2,
            'discounts' => ['failed' => 3],
            'webhook_id' => null,
        ]))->pluck('code')->all();
        foreach (['auth', 'circuit_open', 'duplicates', 'discount_failures'] as $code) {
            $this->assertContains($code, $alerts);
        }

        $view = $this->getJson('/api/v1/marketplace/basalam/settings')->assertOk()->json('data');
        $this->assertStringNotContainsString('"AT"', json_encode($view));
        $this->assertStringNotContainsString('whtok', json_encode($view));

        $health = $this->getJson('/api/v1/marketplace/basalam/health')->assertOk()->json('data');
        $this->assertArrayHasKey('alerts', $health);
        $this->assertArrayHasKey('circuit', $health);
    }
}
