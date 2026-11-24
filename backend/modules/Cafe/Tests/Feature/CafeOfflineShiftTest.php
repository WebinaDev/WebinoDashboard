<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Services\CafeShiftService;
use Tests\TestCase;

/**
 * The drawer a sale was taken at, when the network was not there to ask.
 *
 * The till already queues a sale offline so the guest's coffee and the cashier's money are not
 * lost. What was still lost is the *attribution*: `OrderIntake::resolveBranch` reads the
 * cashier's open shift, which no longer exists by the time the sale replays. A two-counter shop
 * would find those sales unattributed, and the cash pickup at close would come up short with no
 * record of which counter it belonged to.
 *
 * So the till writes the shift down while it has a network, sends it with the sale, and the
 * server trusts it only if the shift belongs to the same tenant.
 */
class CafeOfflineShiftTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'offline-shift.test', 'slug' => 'os']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];

        RoleCapability::query()->firstOrCreate([
            'tenant_id' => $this->tenant->id, 'role' => 'staff', 'capability' => 'pos.use',
        ]);
    }

    private function cashier(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
    }

    /** The till asks the server for the drawer while it can still reach it. */
    public function test_bootstrap_reports_the_open_shift(): void
    {
        $cashier = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 100_000]);

        $this->actingAs($cashier, 'sanctum')
            ->getJson('/api/v1/cafe/pos/bootstrap', $this->h)
            ->assertOk()
            ->assertJsonPath('data.shift.id', $shift->id)
            ->assertJsonPath('data.shift.opened_at', $shift->opened_at->toIso8601String());
    }

    /** No shift open is a real answer, not an error: the shop may not use drawers. */
    public function test_bootstrap_says_null_when_no_shift_is_open(): void
    {
        $this->actingAs($this->cashier(), 'sanctum')
            ->getJson('/api/v1/cafe/pos/bootstrap', $this->h)
            ->assertOk()
            ->assertJsonPath('data.shift', null);
    }

    /**
     * A replayed sale is attributed to the shift it was taken in — even if that shift has since
     * been closed — because `shift_id` is the fact and the current open shift is not.
     */
    public function test_a_replayed_sale_uses_the_shift_it_carries(): void
    {
        $cashier = $this->cashier();
        $service = app(CafeShiftService::class);

        $takenIn = $service->openShift($cashier, ['opening_float_minor' => 0]);
        // The cashier closed that drawer and opened another before the queue drained.
        $takenIn->update(['status' => CafeShift::STATUS_CLOSED, 'closed_at' => now()->subHours(2)]);
        $service->openShift($cashier, ['opening_float_minor' => 0]);

        $order = app(\Modules\Cafe\Services\OrderIntake::class)->create(
            $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $this->product(), 'quantity' => 1]],
                'shift_id' => $takenIn->id,
                'client_ref' => 'offline-1',
            ],
            $cashier,
        );

        $this->assertSame($takenIn->id, (int) $order->fresh()->shift_id);
    }

    /** Without the field, the cashier's currently open shift is used — the online behaviour. */
    public function test_a_sale_without_attribution_falls_back_to_the_open_shift(): void
    {
        $cashier = $this->cashier();
        $shift = app(CafeShiftService::class)->openShift($cashier, ['opening_float_minor' => 0]);

        $order = app(\Modules\Cafe\Services\OrderIntake::class)->create(
            $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $this->product(), 'quantity' => 1]],
                'client_ref' => 'online-1',
            ],
            $cashier,
        );

        $this->assertSame($shift->id, (int) $order->fresh()->shift_id);
    }

    /**
     * A shift id from another shop must not be trusted.
     *
     * The id arrives from a browser. Accepting it unchecked would let one tenant attribute its
     * sales to another tenant's drawer, which then fails its count by exactly those sales.
     */
    public function test_a_shift_from_another_tenant_is_ignored(): void
    {
        $cashier = $this->cashier();

        $other = $this->createTenant(['domain' => 'other-offline.test', 'slug' => 'oo']);
        $otherCashier = User::factory()->create(['tenant_id' => $other->id, 'role' => 'staff']);
        $foreignShift = app(CafeShiftService::class)->openShift($otherCashier, ['opening_float_minor' => 0]);

        $order = app(\Modules\Cafe\Services\OrderIntake::class)->create(
            $this->tenant->id,
            [
                'fulfillment' => 'takeaway',
                'items' => [['product_id' => $this->product(), 'quantity' => 1]],
                'shift_id' => $foreignShift->id,
                'client_ref' => 'foreign-1',
            ],
            $cashier,
        );

        $this->assertNull($order->fresh()->shift_id, 'another shop\'s drawer is never accepted');
    }

    private function product(): int
    {
        return (int) \App\Models\Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'قهوه',
            'slug' => 'coffee-'.uniqid(),
            'price_minor' => 50_000,
            'currency' => 'IRR',
            'status' => 'publish',
        ])->id;
    }
}
