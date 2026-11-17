<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Cafe\CafeDeliveryService;
use App\Support\CapabilityChecker;
use Illuminate\Http\Request;

/**
 * Courier run sheet API.
 *
 * Drivers work a queue; managers can release or reassign a stuck run. Every action funnels
 * through CafeDeliveryService so the state machine has exactly one implementation.
 */
class CafeDeliveryController extends Controller
{
    public function __construct(
        private readonly CafeDeliveryService $deliveries,
        private readonly CapabilityChecker $capabilities,
    ) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();

        // A manager sees the whole queue; a driver sees the pool plus their own active runs.
        $driverId = $this->canDispatch($user) ? null : (int) $user->id;

        return response()->json([
            'data' => $this->deliveries->board((int) $user->tenant_id, $driverId),
            'meta' => ['polled_at' => now()->toIso8601String()],
        ]);
    }

    public function claim(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $order);

        $claimed = $this->deliveries->claim($request->user(), $order);

        return response()->json(['data' => $this->deliveries->present($claimed)]);
    }

    public function pickUp(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $order);

        $picked = $this->deliveries->pickUp($request->user(), $order);

        return response()->json(['data' => $this->deliveries->present($picked)]);
    }

    public function deliver(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $order);

        $done = $this->deliveries->deliver($request->user(), $order);

        return response()->json(['data' => $this->deliveries->present($done)]);
    }

    public function fail(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $order);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $failed = $this->deliveries->fail($request->user(), $order, (string) $data['reason']);

        return response()->json(['data' => $this->deliveries->present($failed)]);
    }

    /** Manager-only: put a failed or abandoned run back into the queue. */
    public function release(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $this->assertVisible($request, $order);
        $this->assertDispatcher($request);

        $released = $this->deliveries->release($order);

        return response()->json(['data' => $this->deliveries->present($released)]);
    }

    private function assertVisible(Request $request, Order $order): void
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        // A POS-only cashier must not be able to drive the delivery board.
        abort_unless(
            $this->capabilities->allows($request->user(), 'orders.*')
                || $this->capabilities->allows($request->user(), 'orders.own'),
            403
        );
    }

    private function assertDispatcher(Request $request): void
    {
        abort_unless($this->canDispatch($request->user()), 403);
    }

    /** Dispatch means "may touch anyone's run", which a plain driver must not have. */
    private function canDispatch(\App\Models\User $user): bool
    {
        return $this->capabilities->allows($user, 'orders.*');
    }
}
