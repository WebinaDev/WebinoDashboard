<?php

namespace App\Services\Cafe;

use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Courier run sheet.
 *
 * Drivers claim a delivery, then move it forward. Claiming is the only contended action, so it
 * is a conditional update inside a transaction: two drivers tapping the same order must not
 * both end up owning it.
 */
class CafeDeliveryService
{
    public const STATUS_QUEUED = 'queued';
    public const STATUS_CLAIMED = 'claimed';
    public const STATUS_PICKED_UP = 'picked_up';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_FAILED = 'failed';

    public const STATUSES = [
        self::STATUS_QUEUED,
        self::STATUS_CLAIMED,
        self::STATUS_PICKED_UP,
        self::STATUS_DELIVERED,
        self::STATUS_FAILED,
    ];

    /** Terminal states: nothing may move out of these. */
    public const TERMINAL = [self::STATUS_DELIVERED, self::STATUS_FAILED];

    /** Orders that are not deliverable no matter what the driver taps. */
    private const DEAD_ORDER_STATUSES = [
        'pending_payment',
        'awaiting_gateway',
        'payment_failed',
        'on_hold',
        'cancelled',
        'failed',
        'refunded',
    ];

    /**
     * The board: everything queued plus whatever the driver currently holds.
     *
     * @return list<array<string, mixed>>
     */
    public function board(int $tenantId, ?int $driverId = null): array
    {
        $orders = Order::query()
            ->where('tenant_id', $tenantId)
            ->whereNotIn('status', self::DEAD_ORDER_STATUSES)
            ->whereNotNull('shipping_address')
            ->where(function ($q) use ($driverId) {
                $q->whereNull('delivery_status')
                    ->orWhere('delivery_status', self::STATUS_QUEUED)
                    // A driver always sees their own active runs, even though others do not.
                    ->when($driverId, fn ($inner) => $inner->orWhere(function ($mine) use ($driverId) {
                        $mine->where('delivery_driver_id', $driverId)
                            ->whereIn('delivery_status', [self::STATUS_CLAIMED, self::STATUS_PICKED_UP]);
                    }));
            })
            ->with(['items.product:id,name'])
            ->latest()
            ->limit(100)
            ->get();

        return $orders->map(fn (Order $order) => $this->present($order))->all();
    }

    /**
     * Take ownership of a queued delivery.
     *
     * @throws ValidationException when another driver got there first
     */
    public function claim(User $driver, Order $order): Order
    {
        $this->assertVisible($driver, $order);

        DB::transaction(function () use ($driver, $order) {
            // Conditional write: only one process can match "still unclaimed".
            $claimed = Order::query()
                ->whereKey($order->getKey())
                ->where(function ($q) {
                    $q->whereNull('delivery_status')
                        ->orWhere('delivery_status', self::STATUS_QUEUED);
                })
                ->update([
                    'delivery_status' => self::STATUS_CLAIMED,
                    'delivery_driver_id' => $driver->id,
                    'delivery_claimed_at' => now(),
                ]);

            if ($claimed === 0) {
                throw ValidationException::withMessages([
                    'delivery' => __('api.cafe_delivery_already_claimed'),
                ]);
            }
        });

        return $order->fresh();
    }

    public function pickUp(User $driver, Order $order): Order
    {
        $this->assertOwnedBy($driver, $order);
        $this->assertStatus($order, self::STATUS_CLAIMED);

        $order->update([
            'delivery_status' => self::STATUS_PICKED_UP,
            'delivery_picked_up_at' => now(),
        ]);

        // Keep the kitchen board in step; drivers rarely look at it but the kitchen watches it.
        $this->stampKitchenStatus($order, 'out_for_delivery');

        return $order->fresh();
    }

    public function deliver(User $driver, Order $order): Order
    {
        $this->assertOwnedBy($driver, $order);
        $this->assertStatus($order, self::STATUS_PICKED_UP);

        $order->update([
            'delivery_status' => self::STATUS_DELIVERED,
            'delivery_completed_at' => now(),
        ]);

        $this->stampKitchenStatus($order, 'done');

        return $order->fresh();
    }

    public function fail(User $driver, Order $order, string $reason): Order
    {
        $this->assertOwnedBy($driver, $order);

        if (in_array((string) $order->delivery_status, self::TERMINAL, true)) {
            throw ValidationException::withMessages([
                'delivery' => __('api.cafe_delivery_already_finished'),
            ]);
        }

        $order->update([
            'delivery_status' => self::STATUS_FAILED,
            'delivery_failure_reason' => $reason,
            'delivery_completed_at' => now(),
            // Drop the owner so the run leaves the driver's board. It stays 'failed' for the
            // audit trail; a manager must call release() to put it back in the queue.
            'delivery_driver_id' => null,
        ]);

        return $order->fresh();
    }

    /** A manager reassigning or releasing a stuck run. */
    public function release(Order $order): Order
    {
        if (in_array((string) $order->delivery_status, self::TERMINAL, true)) {
            throw ValidationException::withMessages([
                'delivery' => __('api.cafe_delivery_already_finished'),
            ]);
        }

        $order->update([
            'delivery_status' => self::STATUS_QUEUED,
            'delivery_driver_id' => null,
            'delivery_claimed_at' => null,
            'delivery_picked_up_at' => null,
        ]);

        return $order->fresh();
    }

    /**
     * @return array<string, mixed>
     */
    public function present(Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $address = is_array($order->shipping_address) ? $order->shipping_address : [];

        return [
            'id' => $order->id,
            'number' => $order->number ?? (string) $order->id,
            'status' => $order->status,
            'delivery_status' => $order->delivery_status ?: self::STATUS_QUEUED,
            'delivery_driver_id' => $order->delivery_driver_id,
            'claimed_at' => optional($order->delivery_claimed_at)->toIso8601String(),
            'picked_up_at' => optional($order->delivery_picked_up_at)->toIso8601String(),
            'completed_at' => optional($order->delivery_completed_at)->toIso8601String(),
            'failure_reason' => $order->delivery_failure_reason,
            'customer_name' => $order->customer_name,
            'customer_phone' => $order->customer_phone,
            'customer_note' => $order->customer_note,
            'address' => $this->addressLine($address),
            'area' => $address['city'] ?? $address['state'] ?? null,
            'total_minor' => (int) $order->total_minor,
            'shipping_minor' => (int) $order->shipping_minor,
            'currency' => $order->currency,
            'payment_method' => $meta['payment_method'] ?? null,
            // Cash-on-delivery drivers settle at the door; that is money, not metadata.
            'collect_cash' => $this->collectsCash($order),
            'collect_minor' => $this->collectsCash($order) ? (int) $order->total_minor : 0,
            'ready' => in_array((string) ($meta['kitchen_status'] ?? ''), ['ready', 'done'], true),
            'delivery_at' => $meta['delivery_at'] ?? $meta['pickup_at'] ?? null,
            'created_at' => optional($order->created_at)->toIso8601String(),
            'items' => $order->relationLoaded('items')
                ? $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'name' => $item->product_name ?: $item->product?->name,
                    'quantity' => (int) $item->quantity,
                ])->values()->all()
                : [],
        ];
    }

    /** Cash the driver must collect at the door. */
    private function collectsCash(Order $order): bool
    {
        return in_array((string) $order->payment_tender, ['cod', 'cash'], true)
            && (string) $order->status !== 'paid';
    }

    /** @param  array<string, mixed>  $address */
    private function addressLine(array $address): string
    {
        $parts = array_filter([
            $address['address_line'] ?? $address['line1'] ?? null,
            $address['district'] ?? null,
            $address['city'] ?? null,
        ], fn ($part) => is_string($part) && trim($part) !== '');

        return $parts === [] ? '' : implode('، ', $parts);
    }

    private function assertVisible(User $user, Order $order): void
    {
        if ((int) $user->tenant_id !== (int) $order->tenant_id) {
            abort(403);
        }
    }

    private function assertOwnedBy(User $user, Order $order): void
    {
        $this->assertVisible($user, $order);

        // An unclaimed run has no owner, so any driver may inspect it; once claimed it is closed
        // to everyone else until it finishes or a manager releases it.
        if ($order->delivery_driver_id !== null && (int) $order->delivery_driver_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'delivery' => __('api.cafe_delivery_not_yours'),
            ]);
        }
    }

    private function assertStatus(Order $order, string $expected): void
    {
        if ((string) $order->delivery_status !== $expected) {
            throw ValidationException::withMessages([
                'delivery' => __('api.cafe_delivery_wrong_state'),
            ]);
        }
    }

    /** Mirror the state into the order meta the kitchen already reads. */
    private function stampKitchenStatus(Order $order, string $kitchenStatus): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $meta['kitchen_status'] = $kitchenStatus;
        $meta['kitchen_updated_at'] = now()->toIso8601String();
        $order->update(['meta' => $meta]);
    }

    /**
     * @return Collection<int, Order>
     */
    public function byDriver(int $tenantId, int $driverId): Collection
    {
        return Order::query()
            ->where('tenant_id', $tenantId)
            ->where('delivery_driver_id', $driverId)
            ->whereIn('delivery_status', [self::STATUS_CLAIMED, self::STATUS_PICKED_UP])
            ->orderBy('delivery_claimed_at')
            ->get();
    }
}
