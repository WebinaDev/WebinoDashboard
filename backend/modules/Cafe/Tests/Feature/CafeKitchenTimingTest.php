<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Services\OperationsSettings;
use Tests\TestCase;

/**
 * The kitchen board's clock.
 *
 * A board without an age column is a list, not a queue: a ticket that has been waiting
 * twenty-five minutes looks exactly like one that arrived a minute ago. These tests pin the
 * arithmetic and the thresholds, because a kitchen that trusts a wrong colour stops looking
 * at the colours.
 */
class CafeKitchenTimingTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'kds-timing.test', 'slug' => 'kds-timing']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        RoleCapability::query()->firstOrCreate([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
            'capability' => 'kitchen.view',
        ]);
        // A cook's board, without the catalogue grants a manager has.
        RoleCapability::query()->firstOrCreate([
            'tenant_id' => $this->tenant->id,
            'role' => 'cook',
            'capability' => 'kitchen.view',
        ]);

        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    private function ticket(int $minutesAgo, array $meta = []): Order
    {
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'paid',
            'number' => 'KDS-'.uniqid(),
            'table_number' => '4',
            'subtotal_minor' => 50000,
            'total_minor' => 50000,
            'currency' => 'IRT',
            'meta' => array_merge(['source' => 'guest_table', 'kitchen_status' => 'new'], $meta),
        ]);

        // The clock reads `created_at`, so back-date it rather than faking "now".
        $order->forceFill(['created_at' => now()->subMinutes($minutesAgo)])->save();

        return $order->fresh();
    }

    /** @return array{state: string, elapsed_minutes: int}|null */
    private function timingFor(Order $order): ?array
    {
        $rows = collect(
            $this->actingAs($this->admin, 'sanctum')
                ->getJson('/api/v1/cafe/kitchen-orders')
                ->assertOk()
                ->json('data'),
        );

        return $rows->firstWhere('id', $order->id)['timing'] ?? null;
    }

    public function test_a_fresh_ticket_is_not_flagged(): void
    {
        $timing = $this->timingFor($this->ticket(2));

        $this->assertNotNull($timing);
        $this->assertSame('ok', $timing['state']);
        $this->assertSame(2, $timing['elapsed_minutes']);
    }

    public function test_a_ticket_past_the_warning_threshold_is_flagged_but_not_late(): void
    {
        $timing = $this->timingFor($this->ticket(12));

        $this->assertSame('warn', $timing['state']);
        $this->assertSame(0, $timing['overdue_minutes'], 'amber is a warning, not an overrun');
    }

    public function test_a_ticket_past_the_late_threshold_is_overdue_by_the_difference(): void
    {
        $timing = $this->timingFor($this->ticket(27));

        $this->assertSame('late', $timing['state']);
        $this->assertSame(27 - 20, $timing['overdue_minutes']);
        $this->assertGreaterThan(0, $timing['priority'], 'overdue tickets sort before everything else');
    }

    /** The thresholds are the tenant's, not the code's. */
    public function test_the_thresholds_come_from_the_tenant_settings(): void
    {
        app(OperationsSettings::class)->put($this->tenant->id, [
            'kds_warn_after_minutes' => 3,
            'kds_late_after_minutes' => 5,
        ]);

        $timing = $this->timingFor($this->ticket(6));

        $this->assertSame(3, $timing['warn_after_minutes']);
        $this->assertSame(5, $timing['late_after_minutes']);
        $this->assertSame('late', $timing['state'], 'six minutes is late once the shop says five');
    }

    /** A finished ticket must stop ageing, or the whole board ends up red and means nothing. */
    public function test_a_finished_ticket_stops_being_overdue(): void
    {
        $timing = $this->timingFor($this->ticket(90, ['kitchen_status' => 'served']));

        $this->assertSame('finished', $timing['state']);
        $this->assertSame(0, $timing['overdue_minutes']);
    }

    /** A misconfigured pair (late < warn) must not produce a ticket that is never late. */
    public function test_a_late_threshold_below_the_warning_threshold_is_corrected(): void
    {
        app(OperationsSettings::class)->put($this->tenant->id, [
            'kds_warn_after_minutes' => 20,
            'kds_late_after_minutes' => 5,
        ]);

        $timing = $this->timingFor($this->ticket(25));

        $this->assertGreaterThan($timing['warn_after_minutes'], $timing['late_after_minutes']);
        $this->assertSame('late', $timing['state']);
    }
}
