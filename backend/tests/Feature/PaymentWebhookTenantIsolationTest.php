<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentWebhookTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unverified_webhook_does_not_fail_a_pending_intent(): void
    {
        $tenant = Tenant::query()->create(['name' => 'Site 1', 'slug' => 'site-001', 'domain' => 'site-001.example.local', 'license_key' => 'test', 'setup_completed' => true]);
        $order = Order::query()->create(['tenant_id' => $tenant->id, 'number' => 'order_001', 'status' => 'pending_payment', 'subtotal_minor' => 1000, 'total_minor' => 1000, 'currency' => 'IRR']);
        $intent = PaymentIntent::query()->create([
            'tenant_id' => $tenant->id,
            'order_id' => $order->id,
            'provider' => 'stripe',
            'status' => 'created',
            'meta' => ['stripe_session_id' => 'cs_test_001', 'amount_rial' => 1000],
        ]);

        Http::fake();
        $this->postJson('/api/v1/payments/webhook/stripe', ['order_id' => $order->id, 'session_id' => 'cs_test_other'])
            ->assertUnprocessable();
        Http::assertNothingSent();
        $this->assertSame('created', $intent->fresh()->status);
        $this->assertSame('pending_payment', $order->fresh()->status);
    }

    public function test_intent_cannot_settle_an_order_belonging_to_another_tenant(): void
    {
        $first = Tenant::query()->create(['name' => 'Site 1', 'slug' => 'site-001', 'domain' => 'site-001.example.local', 'license_key' => 'test', 'setup_completed' => true]);
        $second = Tenant::query()->create(['name' => 'Site 2', 'slug' => 'site-002', 'domain' => 'site-002.example.local', 'license_key' => 'test', 'setup_completed' => true]);
        $order = Order::query()->create(['tenant_id' => $second->id, 'number' => 'order_001', 'status' => 'pending_payment', 'subtotal_minor' => 1000, 'total_minor' => 1000, 'currency' => 'IRR']);
        PaymentIntent::query()->create([
            'tenant_id' => $first->id,
            'order_id' => $order->id,
            'provider' => 'stripe',
            'status' => 'created',
            'meta' => ['stripe_session_id' => 'cs_test_001', 'amount_rial' => 1000],
        ]);

        Http::fake();
        $this->postJson('/api/v1/payments/webhook/stripe', ['order_id' => $order->id])
            ->assertNotFound();
        Http::assertNothingSent();
        $this->assertSame('pending_payment', $order->fresh()->status);
    }
}
