<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\User;
use App\Services\Cafe\OrderPayments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CafeOrderPaymentsHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_replacing_payments_preserves_history_and_returns_only_active_rows(): void
    {
        $tenant = $this->createTenant();
        $actor = User::factory()->create(['tenant_id' => $tenant->id]);
        $order = Order::query()->create([
            'tenant_id' => $tenant->id,
            'number' => 'test_order_001',
            'status' => 'pending_payment',
            'total_minor' => 100,
            'currency' => 'IRR',
        ]);
        $service = app(OrderPayments::class);
        $service->replace($order, [['tender' => 'cash', 'amount_minor' => 40]], $actor->id);
        $oldId = OrderPayment::query()->where('order_id', $order->id)->value('id');

        $updated = $service->replace($order, [
            ['tender' => 'cash', 'amount_minor' => 30],
            ['tender' => 'pos_terminal', 'amount_minor' => 70],
        ], $actor->id);

        $previous = OrderPayment::query()->findOrFail($oldId);
        $this->assertSame(40, $previous->amount_minor);
        $this->assertNotNull($previous->superseded_at);
        $this->assertSame($actor->id, $previous->superseded_by);
        $this->assertSame(3, OrderPayment::query()->where('order_id', $order->id)->count());
        $this->assertCount(2, $service->forOrder($updated));
        $this->assertCount(2, $updated->payments);
        $this->assertSame(30, $service->cashPortion($updated));
        $this->assertSame(100, $updated->amount_paid_minor);
    }

    public function test_rejected_payment_does_not_change_existing_payment(): void
    {
        $tenant = $this->createTenant();
        $order = Order::query()->create([
            'tenant_id' => $tenant->id,
            'number' => 'test_order_002',
            'status' => 'pending_payment',
            'total_minor' => 100,
            'currency' => 'IRR',
        ]);
        $service = app(OrderPayments::class);
        $service->replace($order, [['tender' => 'cash', 'amount_minor' => 50]]);
        $staleOrder = $order->fresh();
        $order->forceFill(['total_minor' => 40])->save();

        try {
            $service->replace($staleOrder, [['tender' => 'cash', 'amount_minor' => 50]]);
            $this->fail('An amount greater than the current total was accepted.');
        } catch (ValidationException) {
            $this->assertSame(1, OrderPayment::query()->where('order_id', $order->id)->whereNull('superseded_at')->count());
            $this->assertSame(50, $service->cashPortion($order));
        }
    }
}
