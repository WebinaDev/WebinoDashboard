<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Services\ServiceMode;
use Tests\TestCase;

/**
 * Service mode: table, pager, or none.
 *
 * Before this, every dine-in order demanded a table code at intake, so a pager-only bakery
 * could not take a dine-in sale at all and a takeaway counter was told to pick a table it did
 * not have. The mode is checked from one place so all three entry points agree.
 */
class CafeServiceModeTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private \App\Models\User $owner;

    private Product $latte;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'mode.test', 'slug' => 'mode']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true]);

        $this->owner = \App\Models\User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->latte = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Latte',
            'slug' => 'latte-'.uniqid(),
            'price_minor' => 50000,
            'currency' => 'IRT',
            'is_available' => true,
        ]);

        $this->actingAs($this->owner, 'sanctum');

        DB::table('cafe_tables')->insert([
            'tenant_id' => $this->tenant->id,
            'code' => 'T1',
            'label' => 'Window',
            'seats' => 2,
            'is_active' => true,
            'status' => 'free',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function setMode(string $mode): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'operations', [
            'service_mode' => $mode,
        ]);
    }

    private function orderPayload(array $overrides = []): array
    {
        return array_merge([
            'fulfillment' => 'dine_in',
            'items' => [['product_id' => $this->latte->id, 'quantity' => 1]],
        ], $overrides);
    }

    /** Table service refuses a dine-in order with no table. */
    public function test_table_mode_requires_a_table(): void
    {
        $this->setMode('table');

        $this->postJson('/api/v1/cafe/pos/orders', $this->orderPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors('table_code');

        $this->postJson('/api/v1/cafe/pos/orders', $this->orderPayload(['table_code' => 'T1']))
            ->assertCreated();
    }

    /**
     * Pager service refuses an order with no pager and never asks for a table.
     *
     * This is the case that was impossible: a pager-only shop had no way to take a dine-in
     * order, because intake demanded a table that does not exist.
     */
    public function test_pager_mode_requires_a_pager_and_not_a_table(): void
    {
        $this->setMode('pager');

        $this->postJson('/api/v1/cafe/pos/orders', $this->orderPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors('pager_number');

        $response = $this->postJson('/api/v1/cafe/pos/orders', $this->orderPayload(['pager_number' => '12']))
            ->assertCreated();

        $order = \App\Models\Order::query()->findOrFail($response->json('data.id'));
        $this->assertSame('12', $order->meta['pager_number'] ?? null);
        $this->assertNull($order->table_number, 'pager service does not seat a table');
    }

    /** No seat service at all: a dine-in order needs neither. */
    public function test_none_mode_needs_neither_table_nor_pager(): void
    {
        $this->setMode('none');

        $response = $this->postJson('/api/v1/cafe/pos/orders', $this->orderPayload())
            ->assertCreated();

        $this->assertNull($response->json('data.table_number'));
    }

    /** An unknown stored value falls back to table service rather than accepting anything. */
    public function test_an_unknown_mode_falls_back_to_table_service(): void
    {
        $this->setMode('drive_through');

        $this->assertSame('table', app(ServiceMode::class)->of($this->tenant->id));
    }

    /** The bootstrap tells the till which field to ask for. */
    public function test_the_pos_bootstrap_reports_what_dine_in_needs(): void
    {
        $this->setMode('pager');

        $service = $this->getJson('/api/v1/cafe/pos/bootstrap')->assertOk()->json('data.service');

        $this->assertSame('pager', $service['mode']);
        $this->assertFalse($service['needs_table']);
        $this->assertTrue($service['needs_pager']);
    }

    /** A non-dine-in order is unaffected by the mode. */
    public function test_takeaway_ignores_the_service_mode(): void
    {
        $this->setMode('table');

        $this->postJson('/api/v1/cafe/pos/orders', array_merge($this->orderPayload(), ['fulfillment' => 'takeaway']))
            ->assertCreated();
    }
}
