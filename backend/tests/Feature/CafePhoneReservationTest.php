<?php

namespace Tests\Feature;

use App\Models\Reservation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Bookings taken at the door and over the telephone.
 *
 * The public endpoint was the only way into the book, which meant a restaurant could not record
 * the booking it had just taken on the phone — the overwhelming majority of them — anywhere but
 * on paper. These tests pin the two deliberate differences from the public endpoint: a past
 * time is allowed (the host records the party already seated) and the source is stamped.
 */
class CafePhoneReservationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'booking.test', 'slug' => 'booking']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true, 'cafe.reservations' => true]);

        $this->owner = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->actingAs($this->owner, 'sanctum');
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'guest_name' => 'Sara',
            'guest_phone' => '09120000000',
            'party_size' => 4,
            'reserved_at' => now()->addHours(2)->toDateTimeString(),
        ], $overrides);
    }

    /** A booking taken on the phone is confirmed the moment it is taken. */
    public function test_a_phone_booking_is_saved_as_confirmed_and_stamped_with_its_source(): void
    {
        $response = $this->postJson('/api/v1/cafe/reservations', $this->payload());

        $response->assertCreated()
            ->assertJsonPath('data.guest_name', 'Sara')
            ->assertJsonPath('data.status', 'confirmed');

        $reservation = Reservation::query()->latest('id')->firstOrFail();

        $this->assertSame('phone', $reservation->source);
        $this->assertNotNull($reservation->confirmed_at, 'lead time is measured from the confirmation');
        $this->assertSame($this->tenant->id, $reservation->tenant_id);
    }

    /**
     * A time in the past is accepted.
     *
     * The public endpoint rejects it, correctly — a guest cannot book yesterday. A host walking a
     * party to their table needs exactly that, and refusing it is how the book stops being the
     * record of what happened.
     */
    public function test_a_party_already_seated_can_be_recorded_with_a_past_time(): void
    {
        $this->postJson('/api/v1/cafe/reservations', $this->payload([
            'reserved_at' => now()->subMinutes(10)->toDateTimeString(),
        ]))->assertCreated();

        $this->assertSame(1, Reservation::query()->where('tenant_id', $this->tenant->id)->count());
    }

    /** A pending request stays pending and carries no confirmation stamp. */
    public function test_a_request_taken_for_approval_is_not_stamped_as_confirmed(): void
    {
        $this->postJson('/api/v1/cafe/reservations', $this->payload(['status' => 'pending']))
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $this->assertNull(Reservation::query()->latest('id')->firstOrFail()->confirmed_at);
    }

    /** A table from another tenant cannot be attached by guessing its id. */
    public function test_a_table_belonging_to_another_tenant_is_rejected(): void
    {
        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'other']);

        $foreignTable = DB::table('cafe_tables')->insertGetId([
            'tenant_id' => $other->id,
            'code' => 'X1',
            'seats' => 2,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/v1/cafe/reservations', $this->payload(['table_id' => $foreignTable]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('table_id');
    }

    /** The essentials are required; a booking with no name is not a booking. */
    public function test_name_phone_party_size_and_time_are_required(): void
    {
        $this->postJson('/api/v1/cafe/reservations', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['guest_name', 'guest_phone', 'party_size', 'reserved_at']);
    }
}
