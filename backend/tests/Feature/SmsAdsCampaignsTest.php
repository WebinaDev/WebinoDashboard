<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\SmsAdCampaign;
use App\Models\SmsNewsletterSubscriber;
use App\Models\User;
use App\Services\Sms\SmsLocalFeatures;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SmsAdsCampaignsTest extends TestCase
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

    public function test_preview_quote_create_list_and_cancel_sms_ad(): void
    {
        Http::fake([
            '*/modirpayamak/send/calculate-price*' => Http::response([
                'ok' => true,
                'price_per_unit' => 100,
                'customer_cost' => 100,
                'parts' => 1,
                'discount_percent' => 0,
            ], 200),
            '*/modirpayamak/account*' => Http::response([
                'ok' => true,
                'account' => ['balance' => 5000],
            ], 200),
            '*' => Http::response(['ok' => true], 200),
        ]);

        $user = $this->smsUser();
        $this->actingAs($user, 'sanctum');

        SmsNewsletterSubscriber::query()->create([
            'tenant_id' => $user->tenant_id,
            'phone' => '09121112233',
            'product_id' => 0,
        ]);

        $this->postJson('/api/v1/modirpayamak/ads/preview-segment', ['segment' => 'followers'])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('count', 1);

        $this->postJson('/api/v1/modirpayamak/ads/quote', [
            'segment' => 'followers',
            'channel' => 'sms',
            'message' => 'hello',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('recipient_count', 1)
            ->assertJsonPath('customer_cost', 100);

        $campaign = $this->postJson('/api/v1/modirpayamak/ads', [
            'name' => 'کمپین تست',
            'segment' => 'followers',
            'channel' => 'sms',
            'message' => 'فروش ویژه {link}',
            'schedule' => now()->addDays(2)->toDateString(),
            'quoted_cost' => 100,
        ])->assertCreated()
            ->assertJsonPath('ok', true)
            ->json('campaign');

        $this->assertNotEmpty($campaign['id']);
        $this->assertSame('scheduled', $campaign['status']);
        $this->assertStringContainsString('utm_campaign=', $campaign['message']);

        $this->getJson('/api/v1/modirpayamak/ads')
            ->assertOk()
            ->assertJsonPath('items.0.id', $campaign['id']);

        $this->postJson('/api/v1/modirpayamak/ads/'.$campaign['id'].'/cancel')
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertSame(SmsAdCampaign::STATUS_CANCELLED, SmsAdCampaign::query()->firstOrFail()->status);
    }

    public function test_dispatch_due_sends_scheduled_ad(): void
    {
        Http::fake([
            '*/modirpayamak/send' => Http::response(['ok' => true, 'bulk_id' => 'b1'], 200),
            '*' => Http::response(['ok' => true], 200),
        ]);

        $user = $this->smsUser();
        $row = SmsAdCampaign::query()->create([
            'tenant_id' => $user->tenant_id,
            'public_id' => 'smsad_testdue01',
            'name' => 'due-test',
            'segment' => 'followers',
            'channel' => 'sms',
            'message' => 'hi',
            'scheduled_at' => now()->subMinute(),
            'status' => SmsAdCampaign::STATUS_SCHEDULED,
            'recipient_count' => 1,
            'phones' => ['09120000000'],
            'sent' => 0,
            'failed' => 0,
            'cost' => 50,
            'bulk_ids' => [],
            'utm_campaign' => 'smsad_smsad_testdue01',
        ]);

        $sent = app(SmsLocalFeatures::class)->dispatchDue(10);
        $this->assertGreaterThanOrEqual(1, $sent);
        $row->refresh();
        $this->assertSame(SmsAdCampaign::STATUS_SENT, $row->status);
        $this->assertSame(1, $row->sent);
        $this->assertNull($row->phones);
    }

    public function test_stats_attribute_orders_by_utm(): void
    {
        Http::fake();
        $user = $this->smsUser();
        $this->actingAs($user, 'sanctum');

        $row = SmsAdCampaign::query()->create([
            'tenant_id' => $user->tenant_id,
            'public_id' => 'smsad_stats001',
            'name' => 'stats',
            'segment' => 'followers',
            'channel' => 'sms',
            'message' => 'hi',
            'scheduled_at' => now()->subDay(),
            'status' => SmsAdCampaign::STATUS_SENT,
            'recipient_count' => 2,
            'sent' => 2,
            'failed' => 0,
            'cost' => 200,
            'bulk_ids' => [],
            'utm_campaign' => 'smsad_smsad_stats001',
        ]);

        Order::query()->create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'status' => 'paid',
            'currency' => 'IRR',
            'total_minor' => 100000,
            'subtotal_minor' => 100000,
            'utm_campaign' => $row->utm_campaign,
        ]);

        $this->getJson('/api/v1/modirpayamak/ads/'.$row->public_id.'/stats')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('orders', 1)
            ->assertJsonPath('sent', 2);
    }
}
