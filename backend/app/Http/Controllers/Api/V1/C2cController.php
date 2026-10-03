<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\C2cSetting;
use App\Models\Order;
use App\Services\Orders\OrderStatusService;
use App\Services\Orders\OrderStatusTransitions;
use App\Support\OrderAccess;
use Illuminate\Http\Request;

class C2cController extends Controller
{
    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            'enabled' => true,
            'title' => 'کارت به کارت',
            'description' => '',
            'instructions' => '',
            'order_button_text' => '',
            'icon_url' => '',
            'iban' => '',
            'deadline_hours' => 2,
            'deadline_h' => 2,
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
                    ->orWhere('payment_provider', 'card_to_card');
            })
            ->with(['user:id,name,email']);
        app(OrderAccess::class)->scopeOwned($q, $request->user());

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
        $q = Order::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($order);
        app(OrderAccess::class)->scopeOwned($q, $request->user());
        $row = $q->firstOrFail();

        $data = $request->validate([
            'action' => ['required', 'string', 'in:approve,reject'],
            'receipt_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $isCard = (string) ($row->payment_tender ?? '') === 'card_to_card'
            || (string) ($row->payment_provider ?? '') === 'card_to_card';
        $confirmable = ['pending_payment', 'awaiting_gateway', 'on_hold'];
        $target = $data['action'] === 'approve' ? 'paid' : 'failed';
        if (! $isCard || ! in_array((string) $row->status, $confirmable, true) || ! OrderStatusTransitions::canTransition((string) $row->status, $target)) {
            return response()->json([
                'message' => 'Only a card-to-card order waiting for confirmation can be decided.',
                'errors' => ['action' => ['Only a card-to-card order waiting for confirmation can be decided.']],
            ], 422);
        }

        $statuses = app(OrderStatusService::class);
        $stamp = [
            'c2c_decided_by' => $request->user()->id,
            'c2c_decided_at' => now(),
        ];
        $applied = $data['action'] === 'approve'
            ? $statuses->apply($row, 'paid', array_merge($stamp, [
                'c2c_status' => 'approved',
                'c2c_receipt_url' => $data['receipt_url'] ?? $row->c2c_receipt_url,
                'amount_paid_minor' => (int) $row->total_minor,
            ]))
            : $statuses->apply($row, 'failed', array_merge($stamp, [
                'c2c_status' => 'rejected',
            ]));
        if (! $applied) {
            return response()->json([
                'message' => 'Only a card-to-card order waiting for confirmation can be decided.',
                'errors' => ['action' => ['Invalid status transition']],
            ], 422);
        }

        return response()->json(['data' => $row->fresh()]);
    }
}
