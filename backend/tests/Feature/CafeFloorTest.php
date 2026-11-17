<?php

namespace Tests\Feature;

use App\Models\CafeTable;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Waiter floor board: table state must follow the orders, not drift.
 *
 * The failure this guards against is a floor that lies -- a table showing "free" while guests
 * are waiting, or still "occupied" long after they paid and left.
 */
class CafeFloorTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'floor.test', 'slug' => 'floor']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
    }

    private function user(string $role = 'admin'): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => $role]);
    }

    private function table(string $code, int $seats = 4, array $overrides = []): CafeTable
    {
        return CafeTable::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'code' => $code,
            'label' => "Table {$code}",
            'seats' => $seats,
            'is_active' => true,
            'sort_order' => 0,
            'status' => CafeTable::STATUS_FREE,
        ], $overrides));
    }

    private function orderAt(User $user, string $tableCode, int $totalMinor, string $status = 'paid'): Order
    {
        return Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'created_by' => $user->id,
            'number' => 'T-'.uniqid(),
            'status' => $status,
            'total_minor' => $totalMinor,
            'subtotal_minor' => $totalMinor,
            'discount_minor' => 0,
            'shipping_minor' => 0,
            'tax_minor' => 0,
            'table_number' => $tableCode,
            'currency' => 'IRT',
        ]);
    }

    public function test_floor_lists_tables_with_a_summary(): void
    {
        $this->table('A1', 4);
        $this->table('A2', 2);

        $this->actingAs($this->user(), 'sanctum')
            ->getJson('/api/v1/cafe/floor', $this->h)
            ->assertOk()
            ->assertJsonPath('meta.summary.total', 2)
            ->assertJsonPath('meta.summary.free', 2)
            ->assertJsonCount(2, 'data');
    }

    public function test_table_flips_to_ordering_when_an_order_is_placed(): void
    {
        $staff = $this->user();
        $this->table('B1', 4);
        $this->orderAt($staff, 'B1', 180_000, 'preparing');

        $res = $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/cafe/floor', $this->h)
            ->assertOk();

        $row = collect($res->json('data'))->firstWhere('code', 'B1');
        $this->assertSame(CafeTable::STATUS_ORDERING, $row['status']);
        $this->assertTrue($row['occupied']);
        $this->assertSame(1, $row['open_orders']);
        $this->assertSame(180_000, $row['open_total_minor']);
    }

    public function test_table_shows_served_once_the_food_is_out(): void
    {
        $staff = $this->user();
        $this->table('B2', 4);
        $this->orderAt($staff, 'B2', 90_000, 'served');

        $res = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/cafe/floor', $this->h)->assertOk();
        $row = collect($res->json('data'))->firstWhere('code', 'B2');

        $this->assertSame(CafeTable::STATUS_SERVED, $row['status']);
    }

    public function test_cancelled_orders_leave_the_table_free(): void
    {
        $staff = $this->user();
        $this->table('B3', 4);
        $this->orderAt($staff, 'B3', 70_000, 'cancelled');

        $res = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/cafe/floor', $this->h)->assertOk();
        $row = collect($res->json('data'))->firstWhere('code', 'B3');

        $this->assertSame(CafeTable::STATUS_FREE, $row['status']);
        $this->assertFalse($row['occupied']);
        $this->assertSame(0, $row['open_orders']);
        $this->assertSame(0, $row['open_total_minor']);
    }

    public function test_paying_clears_a_table_left_seated(): void
    {
        $staff = $this->user();
        $table = $this->table('B4', 4, ['status' => CafeTable::STATUS_SEATED, 'status_changed_at' => now()]);

        // A stale "seated" mark with nothing open must not keep the table looking busy.
        $res = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/cafe/floor', $this->h)->assertOk();
        $row = collect($res->json('data'))->firstWhere('code', $table->code);

        $this->assertSame(CafeTable::STATUS_FREE, $row['status']);
        $this->assertSame(CafeTable::STATUS_SEATED, $row['stored_status']);
    }

    public function test_waiter_can_reserve_and_the_name_is_required(): void
    {
        $staff = $this->user();
        $table = $this->table('C1', 4);

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/cafe/floor/{$table->id}", ['status' => CafeTable::STATUS_RESERVED], $this->h)
            ->assertStatus(422)
            ->assertJsonValidationErrors('reservation_name');

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/cafe/floor/{$table->id}", [
                'status' => CafeTable::STATUS_RESERVED,
                'reservation_name' => 'Ahmadi',
                'reserved_for_at' => now()->addHours(2)->toIso8601String(),
            ], $this->h)
            ->assertOk()
            ->assertJsonPath('data.status', CafeTable::STATUS_RESERVED)
            ->assertJsonPath('data.reservation_name', 'Ahmadi');
    }

    public function test_cleaning_survives_the_order_check(): void
    {
        $staff = $this->user();
        $table = $this->table('C2', 4);

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/cafe/floor/{$table->id}", ['status' => CafeTable::STATUS_CLEANING], $this->h)
            ->assertOk();

        $res = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/cafe/floor', $this->h)->assertOk();
        $row = collect($res->json('data'))->firstWhere('code', 'C2');

        // A bused table must stay dirty until someone says otherwise.
        $this->assertSame(CafeTable::STATUS_CLEANING, $row['status']);
    }

    public function test_freeing_a_table_clears_the_reservation(): void
    {
        $staff = $this->user();
        $table = $this->table('C3', 4, [
            'status' => CafeTable::STATUS_RESERVED,
            'reservation_name' => 'Karimi',
            'reserved_for_at' => now()->addHour(),
        ]);

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/cafe/floor/{$table->id}/free", [], $this->h)
            ->assertOk()
            ->assertJsonPath('data.status', CafeTable::STATUS_FREE)
            ->assertJsonPath('data.reservation_name', null);

        $this->assertNull($table->fresh()->reserved_for_at);
    }

    public function test_summary_counts_guests_and_open_value(): void
    {
        $staff = $this->user();
        $this->table('D1', 4);
        $this->table('D2', 2);
        $this->table('D3', 6);

        $this->orderAt($staff, 'D1', 200_000, 'preparing');
        $this->orderAt($staff, 'D2', 120_000, 'served');

        $res = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/cafe/floor', $this->h)->assertOk();

        $this->assertSame(3, $res->json('meta.summary.total'));
        $this->assertSame(6, $res->json('meta.summary.guests_seated'));
        $this->assertSame(320_000, $res->json('meta.summary.open_value_minor'));
    }

    public function test_a_waiter_cannot_touch_another_tenants_table(): void
    {
        $other = $this->createTenant(['domain' => 'other-floor.test', 'slug' => 'other-floor']);
        $foreign = CafeTable::query()->create([
            'tenant_id' => $other->id,
            'code' => 'X1',
            'seats' => 4,
            'is_active' => true,
            'status' => CafeTable::STATUS_FREE,
        ]);

        $this->actingAs($this->user(), 'sanctum')
            ->patchJson("/api/v1/cafe/floor/{$foreign->id}", ['status' => CafeTable::STATUS_SEATED], $this->h)
            ->assertForbidden();
    }
}
