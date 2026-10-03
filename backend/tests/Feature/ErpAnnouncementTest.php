<?php

namespace Tests\Feature;

use App\Models\ErpAnnouncement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ErpAnnouncementTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_inbox_lists_marks_and_hides_other_audiences(): void
    {
        $tenant = $this->createTenant(['slug' => 'announce', 'domain' => 'announce.test']);
        $other = $this->createTenant(['slug' => 'other', 'domain' => 'other.test']);
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $customer = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'customer']);

        ErpAnnouncement::query()->create([
            'tenant_id' => $tenant->id,
            'source_id' => '42',
            'title' => 'Staff note',
            'body' => 'Hello',
            'audience' => 'staff',
            'created_at' => '2026-10-03 15:00:00',
        ]);
        ErpAnnouncement::query()->create([
            'tenant_id' => $other->id,
            'source_id' => '99',
            'title' => 'Other shop',
            'body' => 'Hidden',
            'audience' => 'all',
            'created_at' => '2026-10-03 15:00:00',
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/v1/account/announcements')
            ->assertOk()
            ->assertJsonPath('data.unread', 1)
            ->assertJsonPath('data.items.0.id', 42)
            ->assertJsonPath('data.items.0.title', 'Staff note')
            ->assertJsonPath('data.items.0.audience', 'staff')
            ->assertJsonPath('data.items.0.read', false);

        $this->postJson('/api/v1/account/announcements/42/read')->assertOk();
        $this->getJson('/api/v1/account/announcements')->assertJsonPath('data.items.0.read', true)->assertJsonPath('data.unread', 0);

        $this->actingAs($customer, 'sanctum');
        $this->getJson('/api/v1/account/announcements')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_erp_token_ingests_the_contract_payload(): void
    {
        config(['services.webino.erp_api_token' => 'erp-secret']);
        $tenant = $this->createTenant(['domain' => 'shop.test']);

        $this->postJson('/api/v1/integrations/erp/announcements', [
            'id' => 'erp-7',
            'title' => 'Maintenance',
            'body' => 'Tonight',
            'created_at' => '2026-10-03T18:30:00+03:30',
            'audience' => 'all',
            'tenant_domain' => 'shop.test',
        ], ['Authorization' => 'Bearer erp-secret'])->assertCreated()
            ->assertJsonPath('data.id', 'erp-7')
            ->assertJsonPath('data.title', 'Maintenance')
            ->assertJsonPath('data.audience', 'all');

        $this->assertDatabaseHas('erp_announcements', [
            'source_id' => 'erp-7',
            'tenant_id' => $tenant->id,
            'title' => 'Maintenance',
        ]);

        $this->postJson('/api/v1/integrations/erp/announcements', [
            'id' => 'erp-7',
            'title' => 'Maintenance',
            'body' => 'Tonight',
            'created_at' => '2026-10-03T18:30:00+03:30',
            'audience' => 'all',
        ])->assertUnauthorized();
    }
}
