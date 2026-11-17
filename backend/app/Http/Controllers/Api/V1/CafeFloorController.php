<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CafeTable;
use App\Services\Cafe\CafeFloorService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Waiter floor board: table status, seating, and the live orders on each table.
 *
 * Table CRUD lives in CafeTableController; this controller owns the *state* of the floor.
 */
class CafeFloorController extends Controller
{
    public function __construct(private readonly CafeFloorService $floor) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $branchId = $request->integer('branch_id') ?: null;

        $tables = $this->floor->floor($tid, $branchId);

        return response()->json([
            'data' => $tables,
            'meta' => [
                'summary' => $this->summary($tables),
                'polled_at' => now()->toIso8601String(),
            ],
        ]);
    }

    /** Change a table's state: seat guests, mark cleaning, reserve, free it. */
    public function updateStatus(Request $request, CafeTable $table): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $table->tenant_id, 403);

        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(CafeTable::STATUSES)],
            'reservation_name' => ['nullable', 'string', 'max:120'],
            'reserved_for_at' => ['nullable', 'date'],
            'active_order_id' => ['nullable', 'integer', Rule::exists('orders', 'id')->where('tenant_id', $table->tenant_id)],
        ]);

        $status = (string) $data['status'];

        if ($status === CafeTable::STATUS_RESERVED) {
            if (empty($data['reservation_name']) && empty($table->reservation_name)) {
                throw ValidationException::withMessages([
                    'reservation_name' => __('api.cafe_table_reservation_name_required'),
                ]);
            }
        }

        $table->update([
            'status' => $status,
            'status_changed_at' => now(),
            'reservation_name' => $status === CafeTable::STATUS_RESERVED
                ? ($data['reservation_name'] ?? $table->reservation_name)
                : null,
            'reserved_for_at' => $status === CafeTable::STATUS_RESERVED
                ? ($data['reserved_for_at'] ?? $table->reserved_for_at)
                : null,
            'active_order_id' => $data['active_order_id'] ?? $table->active_order_id,
        ]);

        $table = $table->fresh()->load('branch:id,name_fa,name_en,slug');
        $orders = $this->floor->liveOrdersByTable((int) $table->tenant_id)->get((string) $table->code, collect());

        return response()->json(['data' => $this->floor->present($table, $orders)]);
    }

    /** Force a table back to free (e.g. guests walked out) without touching its orders. */
    public function free(Request $request, CafeTable $table): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $table->tenant_id, 403);

        $table->update([
            'status' => CafeTable::STATUS_FREE,
            'status_changed_at' => now(),
            'active_order_id' => null,
            'reservation_name' => null,
            'reserved_for_at' => null,
        ]);

        $table = $table->fresh()->load('branch:id,name_fa,name_en,slug');
        $orders = $this->floor->liveOrdersByTable((int) $table->tenant_id)->get((string) $table->code, collect());

        return response()->json(['data' => $this->floor->present($table, $orders)]);
    }

    /**
     * @param  list<array<string, mixed>>  $tables
     * @return array<string, int>
     */
    private function summary(array $tables): array
    {
        $counts = array_fill_keys(CafeTable::STATUSES, 0);
        $seated = 0;
        $openValue = 0;

        foreach ($tables as $table) {
            $status = (string) $table['status'];
            if (array_key_exists($status, $counts)) {
                $counts[$status]++;
            }
            if (! empty($table['occupied'])) {
                $seated += (int) $table['seats'];
            }
            $openValue += (int) $table['open_total_minor'];
        }

        return $counts + [
            'total' => count($tables),
            'guests_seated' => $seated,
            'open_value_minor' => $openValue,
        ];
    }
}
