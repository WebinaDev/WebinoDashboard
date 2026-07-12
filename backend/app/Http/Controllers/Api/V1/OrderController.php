<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $orders = Order::query()
            ->where('tenant_id', $tid)
            ->with(['items.product', 'user:id,name,email'])
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $orders]);
    }

    public function show(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order)
            ->firstOrFail();

        return response()->json(['data' => $row->load(['items.product', 'user:id,name,email'])]);
    }

    public function update(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order)
            ->firstOrFail();

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:pending_payment,paid,payment_failed,processing,shipped,cancelled'],
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'customer_phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'customer_note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()->load(['items.product'])]);
    }
}
