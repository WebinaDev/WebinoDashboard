<?php

namespace Tests\Feature;

use App\Jobs\SyncConsultationToErmJob;
use App\Models\SiteConsultation;
use App\Models\Tenant;
use App\Services\Erm\ErmConsultationSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ConsultationSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_consultation_dispatches_sync_job(): void
    {
        Queue::fake();

        Tenant::query()->create([
            'name' => 'T',
            'slug' => 't-consult',
            'domain' => 'localhost',
        ]);

        $this->postJson('/api/v1/public/consultations', [
            'name' => 'Ali',
            'email' => 'ali@example.com',
            'subject' => 'Help',
            'message' => 'Need support',
        ], ['HTTP_HOST' => 'localhost'])
            ->assertCreated();

        Queue::assertPushed(SyncConsultationToErmJob::class);
    }

    public function test_sync_service_updates_erp_consultation_id(): void
    {
        config(['services.webino.base_url' => 'http://erm.test']);
        config(['services.webino.provision_hmac_secret' => 'test-secret']);

        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 't-sync',
            'domain' => 'shop.example.com',
            'provision_token' => 'site-token',
            'crm_account_id' => 5,
        ]);

        $row = SiteConsultation::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Ali',
            'email' => 'ali@example.com',
            'subject' => 'Help',
            'message' => 'Hello',
            'status' => 'new',
        ]);

        Http::fake([
            'http://erm.test/api/webinocrm/v1/consultations/ingest' => Http::response([
                'data' => ['consultation_id' => 42],
            ], 201),
        ]);

        $ok = app(ErmConsultationSyncService::class)->sync($row->fresh());

        $this->assertTrue($ok);
        $row->refresh();
        $this->assertSame(42, $row->erp_consultation_id);
        $this->assertNotNull($row->synced_at);
    }
}
