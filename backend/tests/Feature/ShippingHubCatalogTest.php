<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Shipping\Drivers\CarrierDriverRegistry;
use App\Services\Shipping\ShippingCarrierCatalog;
use App\Services\Shipping\ShippingCarrierSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShippingHubCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Ship Shop',
            'slug' => 'ship-shop',
            'domain' => 'ship-shop.test',
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

    public function test_hub_lists_all_carriers_and_matrix(): void
    {
        $catalog = app(ShippingCarrierCatalog::class);
        $res = $this->getJson('/api/v1/shipping/hub')->assertOk();
        $items = collect($res->json('data.items'));
        $cats = collect($res->json('data.categories'))->pluck('id');

        $this->assertTrue($cats->contains('aggregator'));
        $this->assertTrue($cats->contains('courier'));
        $this->assertTrue($cats->contains('post'));

        foreach ($catalog->ids() as $id) {
            $this->assertTrue($items->contains(fn ($row) => ($row['id'] ?? '') === $id), "missing hub item {$id}");
        }

        $this->assertSame('live', $items->firstWhere('id', 'tapin')['status']);
        $this->assertSame('live', $items->firstWhere('id', 'snapp')['status']);
        $this->assertSame('live', $items->firstWhere('id', 'post')['status']);
        $this->assertSame('scaffold', $items->firstWhere('id', 'postex')['status']);
        $this->assertSame('scaffold', $items->firstWhere('id', 'cod24')['status']);
        $this->assertTrue((bool) $items->firstWhere('id', 'cod24')['coming_soon']);
        $this->assertTrue((bool) $items->firstWhere('id', 'mahex')['coming_soon']);

        $matrix = $res->json('data.matrix');
        $this->assertContains('tapin', $matrix['live']);
        $this->assertContains('postex', $matrix['scaffold']);
    }

    public function test_scaffold_toggle_settings_and_test(): void
    {
        $this->postJson('/api/v1/shipping/hub/postex/toggle', ['enabled' => true])->assertOk();
        $this->assertTrue(app(ShippingCarrierSettingsService::class)->isEnabled($this->tenant->id, 'postex'));

        $this->postJson('/api/v1/shipping/carriers/postex', [
            'enabled' => true,
            'settings' => [
                'api_token' => 'tok-1',
                'sandbox' => true,
                'tracking_url_template' => 'https://postex.ir/tracking/{code}',
            ],
        ])->assertOk()->assertJsonPath('data.settings.has_api_token', true);

        $test = $this->postJson('/api/v1/shipping/carriers/postex/test')->assertOk();
        $this->assertTrue((bool) data_get($test->json(), 'data.data.ok') || (bool) data_get($test->json(), 'data.ok'));
    }

    public function test_driver_registry_live_vs_scaffold(): void
    {
        $registry = app(CarrierDriverRegistry::class);
        $this->assertSame('live', $registry->get('tapin')?->status());
        $this->assertSame('live', $registry->get('post')?->status());
        $this->assertSame('live', $registry->get('dedicated_courier')?->status());
        $this->assertSame('scaffold', $registry->get('tipax')?->status());
        $this->assertSame('scaffold', $registry->get('chapar')?->status());
    }

    public function test_site_works_without_optional_apis(): void
    {
        $zoneId = $this->postJson('/api/v1/shipping/zones', ['name' => 'IR'])
            ->assertCreated()
            ->json('data.zone.id');
        $instanceId = $this->postJson("/api/v1/shipping/zones/{$zoneId}/methods", ['method_id' => 'flat_rate'])
            ->assertCreated()
            ->json('data.method.instance_id');
        $this->putJson("/api/v1/shipping/zones/{$zoneId}/methods/{$instanceId}", [
            'settings' => ['cost' => 25000],
        ])->assertOk();

        $this->postJson('/api/v1/shipping/quote', [
            'state_code' => null,
            'cart_subtotal_minor' => 100000,
        ])->assertOk()->assertJsonPath('data.rates.0.cost_minor', 25000);
    }
}
