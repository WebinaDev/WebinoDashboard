<?php

namespace Tests\Feature;

use App\Models\DashboardModule;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class OwaspArchitectureFixesTest extends TestCase
{
    use RefreshDatabase;

    protected function tenantUser(string $role, array $modules = []): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop-'.$role,
            'domain' => 'shop-'.$role.'.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        if ($modules !== []) {
            $this->enableSubmodules($tenant->id, $modules);
        }

        return User::factory()->create(['tenant_id' => $tenant->id, 'role' => $role]);
    }

    public function test_digikala_rejects_unsigned_webhook_and_enable_without_secret(): void
    {
        $user = $this->tenantUser('admin', ['commerce.marketplace' => true]);
        $settings = app(MarketplaceSettingsService::class);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/marketplace/digikala/settings', [
                'enabled' => true,
                'credentials' => ['client_code' => 'C1'],
            ])
            ->assertStatus(422);

        $settings->save($user->tenant_id, 'digikala', [
            'enabled' => true,
            'credentials' => ['client_code' => 'C1', 'webhook_secret' => 'whsec'],
        ]);
        $settings->patchCredentials($user->tenant_id, 'digikala', ['webhook_secret' => '']);

        $this->call('POST', '/api/v1/public/marketplace/digikala/webhook', [], [], [], [
            'HTTP_HOST' => 'shop-admin.test',
            'CONTENT_TYPE' => 'application/json',
        ], json_encode(['event' => 'order.created']))->assertStatus(403);
    }

    public function test_c2c_settings_are_not_writable_by_orders_own(): void
    {
        $modules = ['commerce.c2c' => true];
        $seller = $this->tenantUser('seller', $modules);
        $this->actingAs($seller, 'sanctum')
            ->putJson('/api/v1/c2c/settings', ['payload' => ['iban' => 'IR1', 'cards' => []]])
            ->assertStatus(403);

        $manager = $this->tenantUser('shop_manager', $modules);
        $this->actingAs($manager, 'sanctum')
            ->putJson('/api/v1/c2c/settings', ['payload' => ['iban' => 'IR1', 'title' => 'کارت']])
            ->assertOk()
            ->assertJsonPath('data.iban', 'IR1');
    }

    public function test_setup_mutations_require_settings_manage(): void
    {
        $author = $this->tenantUser('author');
        $this->actingAs($author, 'sanctum')->getJson('/api/v1/setup/status')->assertOk();
        $this->actingAs($author, 'sanctum')
            ->postJson('/api/v1/setup/complete')
            ->assertStatus(403);
    }

    public function test_marketplace_purchase_strips_mark_paid_and_licenses_only_from_erp_license(): void
    {
        $user = $this->tenantUser('admin');
        $user->tenant->update(['domain' => 'shop-admin.test']);
        DashboardModule::query()->create([
            'slug' => 'blog',
            'requires_license' => true,
            'git_repo' => null,
            'default_version' => '0.1.0',
        ]);
        config(['services.webino.base_url' => 'https://erp.test']);
        Http::fake([
            'https://erp.test/*' => Http::sequence()
                ->push(['data' => ['order' => ['items' => [['module_slug' => 'blog']]]]], 200)
                ->push(['data' => ['order' => ['items' => [['module_slug' => 'blog']]], 'license' => ['id' => 9]]], 200),
        ]);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/modules/marketplace/purchase', [
            'module_slug' => 'blog',
            'mark_paid' => true,
            'pay' => true,
        ])->assertStatus(201);

        Http::assertSent(function ($request) {
            $body = $request->data();

            return str_contains($request->url(), '/marketplace/purchase')
                && ! array_key_exists('mark_paid', $body)
                && ($body['pay'] ?? null) === true;
        });
        $this->assertFalse(
            (bool) TenantModule::query()->where('tenant_id', $user->tenant_id)->where('module_slug', 'blog')->value('licensed')
        );

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/modules/marketplace/purchase', [
            'module_slug' => 'blog',
            'mark_paid' => true,
        ])->assertStatus(201)->assertJsonPath('data.license.id', 9);
        $this->assertTrue(
            (bool) TenantModule::query()->where('tenant_id', $user->tenant_id)->where('module_slug', 'blog')->value('licensed')
        );
    }

    public function test_public_write_routes_are_throttled(): void
    {
        foreach ([
            'api/v1/public/consultations',
            'api/v1/public/cafe/reservations',
            'api/v1/public/cafe/phone-register',
            'api/v1/public/cafe/cart/items',
            'api/v1/public/cafe/checkout',
        ] as $uri) {
            $route = collect(Route::getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === $uri && in_array('POST', $r->methods(), true));
            $this->assertNotNull($route, $uri);
            $this->assertContains('throttle:public-writes', $route->gatherMiddleware(), $uri);
        }
    }

    public function test_modir_path_rejects_traversal(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        ModirPayamakClient::normalizePath('../../other');
    }

    public function test_modir_proxy_rejects_traversal_before_upstream(): void
    {
        $user = $this->tenantUser('admin', ['sms-panel.panel' => true]);
        Http::fake();
        $request = \Illuminate\Http\Request::create('/api/v1/modirpayamak/x', 'POST', ['x' => 1]);
        $request->setUserResolver(fn () => $user);
        $response = app(\App\Http\Controllers\Api\V1\ModirPayamakController::class)->proxy($request, '../../other');
        $this->assertSame(422, $response->getStatusCode());
        Http::assertNothingSent();
        $this->assertSame('drafts', ModirPayamakClient::normalizePath('drafts'));
    }

    public function test_orders_own_cannot_set_client_unit_price_but_pos_can(): void
    {
        $modules = ['commerce.orders' => true, 'commerce.catalog' => true, 'commerce.pos' => true];
        $seller = $this->tenantUser('seller', $modules);
        $product = Product::query()->create([
            'tenant_id' => $seller->tenant_id,
            'name' => 'P',
            'slug' => 'p',
            'price_minor' => 50000,
            'currency' => 'IRT',
            'status' => 'publish',
        ]);
        $payload = ['items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price_minor' => 1]]];

        $created = $this->actingAs($seller, 'sanctum')
            ->postJson('/api/v1/orders', $payload)
            ->assertStatus(201)
            ->json('data.items.0.unit_price_minor');
        $this->assertSame(50000, (int) $created);

        $pos = $this->actingAs($seller, 'sanctum')
            ->postJson('/api/v1/pos/orders', $payload)
            ->assertStatus(201)
            ->json('data.items.0.unit_price_minor');
        $this->assertSame(1, (int) $pos);
    }

    public function test_inventory_summary_requires_catalog_or_reports(): void
    {
        $author = $this->tenantUser('author', ['commerce.inventory' => true]);
        $this->actingAs($author, 'sanctum')->getJson('/api/v1/inventory/summary')->assertStatus(403);

        $manager = $this->tenantUser('shop_manager', ['commerce.inventory' => true]);
        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/inventory/summary')->assertOk();
    }

    public function test_payment_callback_is_scoped_to_host_tenant_and_digipay_requires_provider_id(): void
    {
        $home = Tenant::query()->create([
            'name' => 'A', 'slug' => 'a', 'domain' => 'a.test', 'license_key' => 'k', 'setup_completed' => true, 'default_currency' => 'IRT',
        ]);
        $other = Tenant::query()->create([
            'name' => 'B', 'slug' => 'b', 'domain' => 'b.test', 'license_key' => 'k', 'setup_completed' => true, 'default_currency' => 'IRT',
        ]);
        $foreign = Order::query()->create([
            'tenant_id' => $other->id,
            'status' => 'paid',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
            'number' => 'ORD-B',
        ]);
        URL::forceRootUrl('http://a.test');
        $location = (string) $this->call('GET', '/api/v1/payments/callback/zarinpal/'.$foreign->id)->headers->get('Location');
        $this->assertStringContainsString('payment=failed', $location);
        $this->assertSame('paid', $foreign->fresh()->status);

        $own = Order::query()->create([
            'tenant_id' => $home->id,
            'status' => 'pending_payment',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRT',
            'number' => 'ORD-A',
        ]);
        PaymentIntent::query()->create([
            'tenant_id' => $home->id,
            'order_id' => $own->id,
            'provider' => 'digipay',
            'status' => 'created',
            'meta' => ['provider_id' => 'PROV-1', 'amount_rial' => 1000],
        ]);
        Http::fake();
        $this->call('GET', '/api/v1/payments/callback/digipay/'.$own->id.'?trackingCode=TRK', [], [], [], ['HTTP_HOST' => 'a.test'])
            ->assertRedirect();
        Http::assertNothingSent();
        $this->assertSame('pending_payment', $own->fresh()->status);
    }

    public function test_duplicate_paths_redirect_to_canonical_routes(): void
    {
        $user = $this->tenantUser('admin', ['commerce.catalog' => true]);
        $this->actingAs($user, 'sanctum')
            ->post('/api/v1/products/bulk-sale')
            ->assertStatus(307);
        $this->actingAs($user, 'sanctum')
            ->get('/api/v1/zarinpal/settings')
            ->assertRedirect('/api/v1/payments/gateways/zarinpal');
    }
}
