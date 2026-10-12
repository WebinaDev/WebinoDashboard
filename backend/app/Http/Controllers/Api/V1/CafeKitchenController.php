<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;

class CafeKitchenController extends Controller
{
    private const STATUSES = ['new', 'preparing', 'ready', 'served', 'out_for_delivery', 'done'];

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $orders = Order::query()
            ->where('tenant_id', $tid)
            ->where('created_at', '>=', now()->subHours(18))
            // Unpaid online orders stay off the kitchen board until the gateway verifies payment.
            ->whereNotIn('status', ['pending_payment', 'awaiting_gateway', 'payment_failed', 'cancelled', 'failed', 'refunded'])
            ->where(function ($q) {
                $q->whereNotNull('table_number')
                    ->orWhere('meta->source', 'guest_table');
            })
            ->with(['items.product:id,name'])
            ->latest()
            ->limit(80)
            ->get()
            ->map(fn (Order $order) => $this->present($order));

        return response()->json(['data' => $orders]);
    }

    public function update(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);
        $data = $request->validate([
            'kitchen_status' => ['required', 'string', 'in:'.implode(',', self::STATUSES)],
        ]);
        $meta = is_array($order->meta) ? $order->meta : [];
        $meta['kitchen_status'] = $data['kitchen_status'];
        $meta['kitchen_updated_at'] = now()->toIso8601String();
        $order->meta = $meta;
        $order->save();

        // Handing the order over closes it, so reports and the order list stop showing it as open.
        if ($data['kitchen_status'] === 'done' && \App\Services\Orders\OrderStatusTransitions::canTransition((string) $order->status, 'completed')) {
            app(\App\Services\Orders\OrderStatusService::class)->apply($order, 'completed');
        }

        return response()->json(['data' => $this->present($order->fresh()->load('items.product:id,name'))]);
    }

    /** @return array<string, mixed> */
    private function present(Order $order): array
    {
        $meta = is_array($order->meta) ? $order->meta : [];

        return [
            'id' => $order->id,
            'number' => $order->number ?? $order->id,
            'status' => $order->status,
            'kitchen_status' => $meta['kitchen_status'] ?? 'new',
            'fulfillment' => $meta['fulfillment'] ?? 'dine_in',
            'table_number' => $order->table_number,
            'branch_slug' => $order->branch_slug,
            'customer_phone' => $order->customer_phone,
            'customer_note' => $order->customer_note,
            'customer_name' => $order->customer_name,
            'shipping_address' => $order->shipping_address,
            'delivery' => $meta['delivery'] ?? null,
            'pickup_at' => $meta['pickup_at'] ?? null,
            'payment_method' => $meta['payment_method'] ?? null,
            'total_minor' => $order->total_minor,
            'currency' => $order->currency,
            'created_at' => $order->created_at,
            'items' => $order->items->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->product_name ?: $item->product?->name,
                'quantity' => $item->quantity,
                'unit_price_minor' => $item->unit_price_minor,
                'selections' => is_array($item->meta) ? ($item->meta['selections'] ?? []) : [],
            ])->values(),
        ];
    }
}
