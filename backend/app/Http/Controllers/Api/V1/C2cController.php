<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\C2cSetting;
use App\Models\Order;
use Illuminate\Http\Request;

class C2cController extends Controller
{
    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            'enabled' => true,
            'title' => 'کارت به کارت',
            'instructions' => '',
            'iban' => '',
            'deadline_hours' => 24,
            'cards' => [],
        ];
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        $row = C2cSetting::query()->firstOrCreate(
            ['tenant_id' => $request->user()->tenant_id],
            ['payload' => self::defaultSettings()]
        );

        return response()->json(['data' => $row->payload ?? self::defaultSettings()]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);
        $row = C2cSetting::query()->updateOrCreate(
            ['tenant_id' => $request->user()->tenant_id],
            ['payload' => $data['payload']]
        );

        return response()->json(['data' => $row->payload]);
    }

    public function receipts(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $status = $request->query('status', 'pending');
        $q = Order::query()
            ->where('tenant_id', $tid)
            ->where(function ($w) {
                $w->where('payment_tender', 'card_to_card')
                    ->orWhereNotNull('c2c_status');
            })
            ->with(['user:id,name,email']);

        if ($status && $status !== 'all') {
            $q->where('c2c_status', $status);
        }

        $items = $q->orderByDesc('id')->paginate(min(50, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $items->items(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page' => $items->lastPage(),
                'total' => $items->total(),
            ],
        ]);
    }

    public function decide(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order)
            ->firstOrFail();

        $data = $request->validate([
            'action' => ['required', 'string', 'in:approve,reject'],
            'receipt_url' => ['nullable', 'string', 'max:2048'],
        ]);

        if ($data['action'] === 'approve') {
            $row->update([
                'c2c_status' => 'approved',
                'c2c_decided_by' => $request->user()->id,
                'c2c_decided_at' => now(),
                'c2c_receipt_url' => $data['receipt_url'] ?? $row->c2c_receipt_url,
                'status' => 'paid',
            ]);
        } else {
            $row->update([
                'c2c_status' => 'rejected',
                'c2c_decided_by' => $request->user()->id,
                'c2c_decided_at' => now(),
                'status' => 'failed',
            ]);
        }

        return response()->json(['data' => $row->fresh()]);
    }
}
