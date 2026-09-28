<?php

namespace Tests\Feature;

use App\Models\SmsDraft;
use App\Models\SmsScheduledSend;
use App\Models\User;
use App\Services\Sms\SmsLocalFeatures;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SmsLocalFeaturesTest extends TestCase
{
    use RefreshDatabase;

    protected function smsUser(): User
    {
        $tenant = $this->createTenant();
        $this->enableSubmodules($tenant->id, ['sms-panel.panel' => true]);

        /** @var User $user */
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        config(['services.webino.base_url' => 'https://crm.test']);

        return $user;
    }

    public function test_drafts_crud_is_local_and_tenant_scoped(): void
    {
        Http::fake();
        $user = $this->smsUser();
        $this->actingAs($user, 'sanctum');

        $id = $this->postJson('/api/v1/modirpayamak/drafts', [
            'title' => 'Welcome',
            'message' => 'Hello {name}',
            'recipients' => ['09120000000'],
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.title', 'Welcome')
            ->json('data.id');

        $this->getJson('/api/v1/modirpayamak/drafts?page=1')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.message', 'Hello {name}')
            ->assertJsonPath('meta.total', 1);

        $this->postJson('/api/v1/modirpayamak/drafts', ['id' => $id, 'title' => 'Updated', 'text' => 'Bye'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Updated')
            ->assertJsonPath('data.body', 'Bye');

        $this->postJson('/api/v1/modirpayamak/drafts', ['title' => 'Empty'])->assertStatus(422);

        $other = User::factory()->create(['tenant_id' => $this->createTenant()->id, 'role' => 'admin']);
        $this->enableSubmodules($other->tenant_id, ['sms-panel.panel' => true]);
        $this->actingAs($other, 'sanctum');
        $this->getJson('/api/v1/modirpayamak/drafts')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/modirpayamak/drafts/delete', ['id' => $id])->assertNotFound();

        $this->actingAs($user, 'sanctum');
        $this->postJson('/api/v1/modirpayamak/drafts/delete', ['id' => $id])
            ->assertOk()
            ->assertJsonPath('ok', true);
        $this->assertSame(0, SmsDraft::query()->count());

        Http::assertNothingSent();
    }

    public function test_future_send_is_held_locally_listed_and_cancellable(): void
    {
        Http::fake([
            '*/modirpayamak/reports/outbox*' => Http::response(['ok' => true, 'data' => []], 200),
            '*' => Http::response(['ok' => true], 200),
        ]);
        $user = $this->smsUser();
        $this->actingAs($user, 'sanctum');

        $outboxId = $this->postJson('/api/v1/modirpayamak/send', [
            'phone' => '09120000000',
            'message' => 'Later',
            'send_time' => now()->addDay()->toIso8601String(),
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('scheduled', true)
            ->json('messages_outbox_id');

        $this->assertStringStartsWith('local-', $outboxId);
        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), '/modirpayamak/send'));

        $this->getJson('/api/v1/modirpayamak/reports/outbox?page=1&limit=50')
            ->assertOk()
            ->assertJsonPath('data.0.messages_outbox_id', $outboxId)
            ->assertJsonPath('data.0.message', 'Later');

        $this->postJson('/api/v1/modirpayamak/send/cancel-scheduled', ['messages_outbox_id' => $outboxId])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('status', 'cancelled');

        $row = SmsScheduledSend::query()->firstOrFail();
        $this->assertSame(SmsScheduledSend::STATUS_CANCELLED, $row->status);

        $this->postJson('/api/v1/modirpayamak/send/cancel-scheduled', ['messages_outbox_id' => $outboxId])
            ->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonPath('reason', 'not_pending');

        $this->assertSame(0, app(SmsLocalFeatures::class)->dispatchDue());
        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), '/modirpayamak/send'));
    }

    public function test_due_scheduled_send_is_dispatched(): void
    {
        Http::fake(['*' => Http::response(['ok' => true, 'edge' => []], 200)]);
        $user = $this->smsUser();

        SmsScheduledSend::query()->create([
            'tenant_id' => $user->tenant_id,
            'path' => 'send',
            'payload' => ['message' => 'Now', 'recipients' => ['09120000000']],
            'message' => 'Now',
            'recipients' => ['09120000000'],
            'send_at' => now()->subMinute(),
            'status' => SmsScheduledSend::STATUS_PENDING,
        ]);

        $this->assertSame(1, app(SmsLocalFeatures::class)->dispatchDue());
        $this->assertSame(SmsScheduledSend::STATUS_SENT, SmsScheduledSend::query()->firstOrFail()->status);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/modirpayamak/send') && $r['message'] === 'Now');
    }

    public function test_secretaries_process_reports_reason_without_rules(): void
    {
        Http::fake([
            '*/modirpayamak/secretaries*' => Http::response(['ok' => true, 'secretaries' => []], 200),
        ]);
        $user = $this->smsUser();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/modirpayamak/secretaries/process', [])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('processed', 0)
            ->assertJsonPath('reason', 'no_rules')
            ->assertJsonMissingPath('skipped');
    }
}
