<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Orders\PosSettings;
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Payments\PaymentGatewayCatalog;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentsHubCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Hub Shop',
            'slug' => 'hub-shop',
            'domain' => 'hub-shop.test',
            'license_key' => 'k',
            'provision_token' => 'site-token',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.checkout' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_hub_lists_all_catalog_categories_and_gateways(): void
    {
        $catalog = app(PaymentGatewayCatalog::class);
        $res = $this->getJson('/api/v1/payments/hub')->assertOk();
        $payload = $res->json('data') ?? $res->json();
        $items = collect($payload['items'] ?? []);
        $cats = collect($payload['categories'] ?? [])->pluck('id');

        $this->assertTrue($cats->contains('bnpl'));
        $this->assertTrue($cats->contains('aggregator'));
        $this->assertTrue($cats->contains('psp'));
        $this->assertTrue($cats->contains('other'));
        $this->assertTrue($cats->contains('fx_crypto'));

        foreach ($catalog->ids() as $id) {
            $this->assertTrue($items->contains(fn ($row) => ($row['id'] ?? '') === $id), "missing hub item {$id}");
        }

        $this->assertTrue($items->firstWhere('id', 'zarinpal')['status'] === 'live');
        $this->assertTrue($items->firstWhere('id', 'idpay')['status'] === 'live');
        $this->assertTrue($items->firstWhere('id', 'tara')['status'] === 'live');
        $this->assertTrue($items->firstWhere('id', 'stripe')['status'] === 'live');
        $this->assertTrue($items->firstWhere('id', 'paystar')['status'] === 'live');
        $this->assertTrue($items->firstWhere('id', 'shepa')['status'] === 'live');
        $this->assertTrue($items->contains(fn ($row) => ($row['id'] ?? '') === 'perfect_money'));
        $this->assertTrue($items->contains(fn ($row) => ($row['id'] ?? '') === 'ircryptopay'));
        $scaffoldLeft = $items->filter(fn ($row) => ($row['status'] ?? '') === 'scaffold')->pluck('id')->all();
        $this->assertSame([], $scaffoldLeft);
    }

    public function test_tara_toggle_and_settings_round_trip(): void
    {
        $this->postJson('/api/v1/payments/hub/tara/toggle', ['enabled' => true])->assertOk();
        $this->assertTrue(app(PaymentGatewaySettingsService::class)->isEnabled($this->tenant->id, 'tara'));

        $saved = $this->postJson('/api/v1/payments/gateways/tara', [
            'enabled' => true,
            'settings' => [
                'username' => 'u1',
                'password' => 'p1',
                'sandbox' => true,
            ],
        ])->assertOk();
        $this->assertTrue((bool) data_get($saved->json(), 'data.settings.has_password', data_get($saved->json(), 'settings.has_password')));

        $test = $this->postJson('/api/v1/payments/gateways/tara/test')->assertOk();
        $this->assertTrue((bool) data_get($test->json(), 'data.ok', data_get($test->json(), 'ok')));
    }

    public function test_idpay_driver_request_and_registry_live(): void
    {
        $registry = app(GatewayDriverRegistry::class);
        $this->assertSame('live', $registry->get('idpay')?->status());
        $this->assertSame('live', $registry->get('stripe')?->status());
        $this->assertSame('live', $registry->get('coinpayments')?->status());

        Http::fake([
            'api.idpay.ir/*' => Http::response(['id' => 'pay_1', 'link' => 'https://idpay.ir/p/pay_1'], 200),
        ]);

        app(PaymentGatewaySettingsService::class)->save($this->tenant->id, 'idpay', [
            'api_key' => 'key-1',
            'sandbox' => true,
            'cash_enabled' => true,
        ]);
        app(PaymentGatewaySettingsService::class)->setGatewayEnabled($this->tenant->id, 'idpay', true);

        $driver = $registry->get('idpay');
        $result = $driver->request(
            app(PaymentGatewaySettingsService::class)->getRaw($this->tenant->id, 'idpay'),
            100000,
            'https://example.test/cb',
            'Order #9',
            ['order_id' => '9']
        );
        $this->assertTrue($result['ok']);
        $this->assertSame('https://idpay.ir/p/pay_1', $result['redirect_url']);
    }

    public function test_disabling_gateway_prunes_pos_mapping(): void
    {
        $pos = app(PosSettings::class);
        $pos->put($this->tenant->id, [
            'payment_methods' => [
                [
                    'id' => 'online',
                    'enabled' => true,
                    'label' => '',
                    'type' => 'online',
                    'gateway_ids' => ['zarinpal', 'idpay'],
                ],
            ],
        ]);

        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, 'zarinpal', true);
        $gateways->setGatewayEnabled($this->tenant->id, 'idpay', false);

        $mapped = collect($pos->get($this->tenant->id)['payment_methods'])
            ->firstWhere('id', 'online')['gateway_ids'] ?? [];
        $this->assertSame(['zarinpal'], array_values($mapped));
    }
}
