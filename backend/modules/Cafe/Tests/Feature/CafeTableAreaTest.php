<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Entities\CafeTable;
use Modules\Cafe\Services\CafeFloorService;
use Tests\TestCase;

/**
 * A twenty-table café is not one room.
 *
 * The floor board drew every table in one grid, and the only way to say "T1..T9 are upstairs"
 * was the numbering — which reads as T10 after T1 and tells a waiter nothing about where to
 * walk. Tables now carry the hall they stand in, and the board groups by it.
 */
class CafeTableAreaTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'areas.test', 'slug' => 'ar']);

        $this->actingAs(User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]), 'sanctum');
    }

    public function test_a_table_keeps_the_hall_it_was_created_in(): void
    {
        $response = $this->postJson('/api/v1/cafe/tables', [
            'code' => 'T1',
            'label' => 'کنار پنجره',
            'area' => 'تراس',
            'seats' => 2,
        ])->assertCreated();

        $this->assertSame('تراس', $response->json('data.area'));

        // And the list keeps it, so the settings screen can show the room per row.
        $list = $this->getJson('/api/v1/cafe/tables')->assertOk();
        $this->assertSame('تراس', $list->json('data.0.area'));
    }

    /** The floor board reports the hall, and orders tables by it. */
    public function test_the_floor_board_groups_tables_by_hall(): void
    {
        foreach ([['T1', 'تراس'], ['T2', 'سالن اصلی'], ['T3', null]] as [$code, $area]) {
            CafeTable::query()->create([
                'tenant_id' => $this->tenant->id,
                'code' => $code,
                'area' => $area,
                'seats' => 4,
                'is_active' => true,
            ]);
        }

        $floor = app(CafeFloorService::class)->floor((int) $this->tenant->id);

        // The card carries its room; the UI groups on it rather than inventing one.
        $this->assertSame('سالن اصلی', $floor[0]['area']);
        $this->assertSame('تراس', $floor[1]['area']);
        $this->assertNull($floor[2]['area'], 'an unassigned table stays unassigned');

        // And the rooms are contiguous in the payload, so the board does not interleave them.
        $this->assertSame(['سالن اصلی', 'تراس', null], array_column($floor, 'area'));
    }

    /** An update can move a table to another room, or clear the room entirely. */
    public function test_a_table_can_be_moved_between_halls(): void
    {
        $table = CafeTable::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => 'T5',
            'area' => 'تراس',
            'seats' => 4,
            'is_active' => true,
        ]);

        $this->patchJson("/api/v1/cafe/tables/{$table->id}", ['area' => 'بار'])
            ->assertOk()
            ->assertJsonPath('data.area', 'بار');

        $this->patchJson("/api/v1/cafe/tables/{$table->id}", ['area' => null])
            ->assertOk()
            ->assertJsonPath('data.area', null);
    }
}
