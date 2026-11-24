<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Entities\AccWarehouseDocument;
use Modules\Accounting\Entities\AccWarehouseStock;

class WarehouseReadController extends Controller
{
    public function warehouses(Request $request): JsonResponse
    {
        $q = AccWarehouse::query()->orderBy('name');

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    public function warehouseStock(Request $request): JsonResponse
    {
        $q = AccWarehouseStock::query()->with(['warehouse', 'product']);
        if ($request->filled('warehouse_id')) {
            $q->where('warehouse_id', $request->input('warehouse_id'));
        }
        if ($request->boolean('low_only')) {
            $q->whereColumn('quantity', '<=', 'reorder_point');
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 50), 100))]);
    }

    public function warehouseInbound(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()
            ->where('type', 'inbound')
            ->with('warehouse')
            ->orderByDesc('id');

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    public function warehouseOutbound(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()
            ->where('type', 'outbound')
            ->with('warehouse')
            ->orderByDesc('id');

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }

    public function warehouseAudit(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()
            ->where('type', 'audit')
            ->with('warehouse')
            ->orderByDesc('id');

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }
}
