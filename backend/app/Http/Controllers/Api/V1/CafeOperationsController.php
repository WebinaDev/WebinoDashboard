<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CafeDeliveryZone;
use App\Models\Order;
use App\Models\OrderAmendment;
use App\Models\OrderItem;
use App\Services\Cafe\DeliveryZones;
use App\Services\Cafe\KitchenColumns;
use App\Services\Cafe\KitchenPrep;
use App\Services\Cafe\OperationsSettings;
use App\Services\Cafe\OrderAmendments;
use App\Services\Cafe\OrderPayments;
use App\Services\Cafe\WorkbenchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Daily operations: workbench, settle, KDS ticks, delivery zones, and paid edits.
 *
 * Tenant scoping always comes from the authenticated user. A branch or order belonging to
 * another tenant simply matches nothing rather than being reported as forbidden, so ids
 * cannot be probed.
 */
class CafeOperationsController extends Controller
{
    public function __construct(
        private readonly WorkbenchService $workbench,
        private readonly OrderPayments $payments,
        private readonly KitchenPrep $prep,
        private readonly DeliveryZones $zones,
        private readonly OrderAmendments $amendments,
        private readonly OperationsSettings $settings,
    ) {}

    /** The prioritized queue plus the live table map, filtered to the caller's role. */
    public function workbench(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $branchId = $request->integer('branch_id') ?: null;
        $role = $request->query('role');
        $role = is_string($role) && $role !== '' ? $role : (string) $request->user()->role;

        $queue = $this->workbench->queue($tenantId, $branchId, $role);
        $floor = $this->workbench->floorMap($tenantId, $branchId);

        return response()->json([
            'data' => [
                'queue' => $queue,
                'tables' => $floor['tables'],
                'counts' => $floor['counts'],
                'role' => $role,
            ],
            'meta' => [
                'polled_at' => now()->toIso8601String(),
                'queue_size' => count($queue),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /** Settings the workbench, KDS and delivery share. */
    public function settingsShow(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'settings' => $this->settings->get($tenantId),
                'defaults' => OperationsSettings::defaults(),
            ],
        ]);
    }

    public function settingsUpdate(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'paid_edit_window_minutes' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'paid_edit_requires_approval' => ['sometimes', 'boolean'],
            'kds_warn_after_minutes' => ['sometimes', 'integer', 'min:1', 'max:180'],
            'kds_late_after_minutes' => ['sometimes', 'integer', 'min:1', 'max:240'],
            'table_overdue_after_minutes' => ['sometimes', 'integer', 'min:5', 'max:600'],
            'queue_stale_after_minutes' => ['sometimes', 'integer', 'min:1', 'max:120'],
            'enforce_delivery_minimum' => ['sometimes', 'boolean'],
            'default_delivery_eta_minutes' => ['sometimes', 'integer', 'min:5', 'max:180'],
        ]);

        return response()->json(['data' => $this->settings->put($tenantId, $data)]);
    }

    /** Record a split payment and mark the sale settled. */
    public function settle(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $data = $request->validate([
            'payments' => ['required', 'array', 'min:1', 'max:6'],
            'payments.*.tender' => ['required', 'string', Rule::in(OrderPayments::TENDERS)],
            'payments.*.amount_minor' => ['required', 'integer', 'min:0'],
            'payments.*.received_minor' => ['nullable', 'integer', 'min:0'],
            'payments.*.reference' => ['nullable', 'string', 'max:120'],
        ]);

        $order = $this->payments->replace($order, $data['payments'], (int) $request->user()->id);

        // Settling is the moment the drawer is credited, so the order moves with it.
        $statuses = app(\App\Services\Orders\OrderStatusService::class);
        $statuses->apply($order, 'processing');

        return response()->json(['data' => [
            'order' => $order->fresh(),
            'payments' => $this->payments->forOrder($order),
            'cash_portion_minor' => $this->payments->cashPortion($order),
        ]]);
    }

    /** Cancel with a reason — required, because "cancelled" alone explains nothing later. */
    public function cancel(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $data = $request->validate([
            'reason_code' => ['required', 'string', Rule::in([
                'guest_cancelled', 'kitchen_error', 'wrong_order', 'out_of_stock', 'duplicate', 'other',
            ])],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $from = (string) $order->status;

        // Voiding a settled sale is a harder permission than taking one.
        if (in_array($from, OrderAmendments::PAID_STATUSES, true)
            && ! app(\App\Support\CapabilityChecker::class)->allows($request->user(), 'orders.void')) {
            return response()->json([
                'message' => __('api.forbidden'),
                'errors' => ['code' => 'CAPABILITY_DENIED'],
            ], 403);
        }

        $statuses = app(\App\Services\Orders\OrderStatusService::class);
        $applied = $statuses->apply($order, 'cancelled');

        if (! $applied) {
            return response()->json([
                'message' => 'This order cannot be cancelled from its current status.',
            ], 422);
        }

        \Illuminate\Support\Facades\DB::table('order_status_log')->insert([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'from_status' => $from,
            'to_status' => 'cancelled',
            'reason' => $data['reason'],
            'reason_code' => $data['reason_code'],
            'actor_id' => $request->user()->id,
            'actor_name' => $request->user()->name,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['data' => $order->fresh()]);
    }

    /** Per-line prep state on the KDS board. */
    public function itemPrep(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $data = $request->validate([
            'order_item_id' => ['required', 'integer'],
            'status' => ['required', 'string', Rule::in(['new', 'preparing', 'ready', 'served'])],
            'station_id' => ['nullable', 'integer', Rule::exists('cafe_kitchen_stations', 'id')->where('tenant_id', $order->tenant_id)],
        ]);

        $item = OrderItem::query()
            ->where('order_id', $order->id)
            ->whereKey($data['order_item_id'])
            ->firstOrFail();

        $this->prep->mark(
            $order,
            $item,
            (string) $data['status'],
            isset($data['station_id']) ? (int) $data['station_id'] : null,
            (int) $request->user()->id,
        );

        return response()->json(['data' => $this->prep->forOrder($order)]);
    }

    /** Prep state for the whole ticket. */
    public function orderPrep(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        return response()->json(['data' => $this->prep->forOrder($order)]);
    }

    public function zonesIndex(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => CafeDeliveryZone::query()
                ->where('tenant_id', $tenantId)
                ->orderBy('sort_order')
                ->get(),
        ]);
    }

    public function zonesStore(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'name_fa' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
            'areas' => ['nullable', 'array', 'max:60'],
            'areas.*' => ['string', 'max:120'],
            'delivery_fee_minor' => ['sometimes', 'integer', 'min:0'],
            'minimum_order_minor' => ['sometimes', 'integer', 'min:0'],
            'eta_minutes' => ['nullable', 'integer', 'min:5', 'max:180'],
            'radius_km' => ['nullable', 'integer', 'min:1', 'max:200'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $zone = CafeDeliveryZone::query()->create(array_merge($data, ['tenant_id' => $tenantId]));

        return response()->json(['data' => $zone], 201);
    }

    public function zonesUpdate(Request $request, CafeDeliveryZone $zone): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $zone->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'nullable', 'string', 'max:255'],
            'areas' => ['sometimes', 'nullable', 'array', 'max:60'],
            'areas.*' => ['string', 'max:120'],
            'delivery_fee_minor' => ['sometimes', 'integer', 'min:0'],
            'minimum_order_minor' => ['sometimes', 'integer', 'min:0'],
            'eta_minutes' => ['sometimes', 'nullable', 'integer', 'min:5', 'max:180'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $zone->update($data);

        return response()->json(['data' => $zone->fresh()]);
    }

    public function zonesDestroy(Request $request, CafeDeliveryZone $zone): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $zone->tenant_id, 403);
        $zone->delete();

        return response()->json([], 204);
    }

    /** What the till should charge for delivery to this address. */
    public function zonesQuote(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'address' => ['nullable', 'string', 'max:500'],
            'subtotal_minor' => ['nullable', 'integer', 'min:0'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        return response()->json(['data' => $this->zones->quote(
            $tenantId,
            isset($data['branch_id']) ? (int) $data['branch_id'] : null,
            $data['address'] ?? null,
            (int) ($data['subtotal_minor'] ?? 0),
        )]);
    }

    /** Ask to change a paid invoice. */
    public function amendmentRequest(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
            'changes' => ['required', 'array'],
            'delta_minor' => ['nullable', 'integer'],
        ]);

        $amendment = $this->amendments->request($order, [
            'reason' => $data['reason'],
            'changes' => $data['changes'],
            'delta_minor' => $data['delta_minor'] ?? null,
        ], $request->user());

        return response()->json(['data' => $amendment], 201);
    }

    public function amendmentApprove(Request $request, OrderAmendment $amendment): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $amendment->tenant_id, 403);

        if (! app(\App\Support\CapabilityChecker::class)->allows($request->user(), 'accounting.approve')
            && ! app(\App\Support\CapabilityChecker::class)->allows($request->user(), 'pos.approve')
            && (string) $request->user()->role !== 'admin') {
            return response()->json([
                'message' => __('api.forbidden'),
                'errors' => ['code' => 'CAPABILITY_DENIED'],
            ], 403);
        }

        return response()->json(['data' => $this->amendments->approve($amendment, $request->user())]);
    }

    public function amendmentReject(Request $request, OrderAmendment $amendment): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $amendment->tenant_id, 403);

        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return response()->json(['data' => $this->amendments->reject($amendment, $request->user(), $data['reason'])]);
    }

    public function amendmentSettle(Request $request, OrderAmendment $amendment): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $amendment->tenant_id, 403);

        $data = $request->validate(['tender' => ['required', 'string', Rule::in(OrderPayments::TENDERS)]]);

        return response()->json(['data' => $this->amendments->settle($amendment, $data['tender'], $request->user())]);
    }

    /**
     * Every amendment awaiting a decision, across all orders.
     *
     * The per-order history was the only way to read amendments, so a manager had to already
     * know which order had a pending edit. This is the queue that makes the approval flow
     * reachable without hunting.
     */
    public function amendmentsPending(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        $rows = OrderAmendment::query()
            ->where('tenant_id', $tid)
            ->whereIn('status', [OrderAmendments::STATUS_PENDING, OrderAmendments::STATUS_APPROVED])
            ->with('order:id,number,total_minor,status,customer_name')
            ->latest()
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function amendmentsIndex(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        return response()->json(['data' => $this->amendments->history($order)]);
    }

    /**
     * KDS column configuration: which prep states are columns, their order and their names.
     *
     * A bakery and a coffee bar do not want the same four words over the same four columns,
     * and a station may want its own set. The board reads these instead of hard-coding labels.
     */
    public function kitchenColumns(Request $request, KitchenColumns $columns): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $stationId = $request->query('station_id');
        $stationId = is_numeric($stationId) ? (int) $stationId : null;

        return response()->json([
            'data' => [
                // What the board should render right now, resolved for this station.
                'columns' => $columns->forStation($tid, $stationId),
                // Everything the settings screen edits.
                ...$columns->all($tid),
                'keys' => KitchenColumns::KEYS,
            ],
        ]);
    }

    /**
     * Replace a scope's columns. Wholesale, so a rename and a reorder are one request and two
     * columns can never end up sharing a key.
     */
    public function kitchenColumnsUpdate(Request $request, KitchenColumns $columns): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'station_id' => ['nullable', 'integer', Rule::exists('cafe_kitchen_stations', 'id')->where('tenant_id', $tid)],
            'columns' => ['required', 'array', 'min:1', 'max:8'],
            'columns.*.key' => ['required', 'string', Rule::in(KitchenColumns::KEYS)],
            'columns.*.label_fa' => ['required', 'string', 'max:60'],
            'columns.*.label_en' => ['nullable', 'string', 'max:60'],
            'columns.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:99'],
            'columns.*.is_active' => ['nullable', 'boolean'],
        ]);

        // A repeated key would render two columns claiming the same state.
        $keys = array_map(fn (array $c): string => (string) $c['key'], $data['columns']);
        if (count($keys) !== count(array_unique($keys))) {
            return response()->json([
                'message' => 'هر وضعیت فقط یک ستون می‌تواند داشته باشد.',
                'errors' => ['columns' => ['duplicate_key']],
            ], 422);
        }

        $stationId = isset($data['station_id']) ? (int) $data['station_id'] : null;

        return response()->json([
            'data' => $columns->replace($tid, $stationId, $data['columns']),
        ]);
    }
}
