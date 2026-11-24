<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccProduct;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Entities\AccWarehouseDocument;
use Modules\Accounting\Entities\AccWarehouseStock;
use Modules\Accounting\Support\ExistsForTenant;

/**
 * REST paths under /wp-json/webinocrm/v1/* (warehouse & products).
 */
class WebinocrmV1RestController extends Controller
{
    protected function wantsLegacy(Request $request): bool
    {
        $legacy = $request->query('legacy', $request->header('X-Webinocrm-Legacy'));

        return $legacy === '1' || $legacy === 1 || $legacy === true;
    }

    protected function jsonList(Request $request, mixed $items, int $total, int $status = 200): JsonResponse
    {
        if ($this->wantsLegacy($request)) {
            return response()->json(['success' => true, 'data' => ['items' => $items, 'total' => $total]], $status);
        }

        return response()->json(['data' => $items, 'total' => $total], $status);
    }

    protected function jsonPayload(Request $request, mixed $data, int $status = 200): JsonResponse
    {
        if ($this->wantsLegacy($request)) {
            return response()->json(['success' => true, 'data' => $data], $status);
        }

        return response()->json(['data' => $data], $status);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function normalizeWarehouseInput(array $data): array
    {
        if (array_key_exists('location', $data) && ! array_key_exists('address', $data)) {
            $data['address'] = $data['location'];
        } elseif (array_key_exists('address', $data) && ! array_key_exists('location', $data)) {
            $data['location'] = $data['address'];
        }

        return $data;
    }

    public function warehousesIndex(Request $request): JsonResponse
    {
        $q = AccWarehouse::query()->orderBy('name');
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $q->where(function ($builder) use ($term) {
                $builder->where('name', 'like', $term)
                    ->orWhere('code', 'like', $term)
                    ->orWhere('location', 'like', $term)
                    ->orWhere('address', 'like', $term);
            });
        }
        $perPage = min((int) $request->input('per_page', 50), 200);
        $paginator = $q->paginate($perPage);

        return $this->jsonList($request, $paginator->items(), $paginator->total());
    }

    public function warehousesCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:191',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'address' => 'nullable|string',
            'location' => 'nullable|string',
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ]);
        $w = AccWarehouse::query()->create($this->normalizeWarehouseInput($data));

        return $this->jsonPayload($request, ['id' => $w->id, 'warehouse' => $w], 201);
    }

    public function warehousesUpdate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'name' => 'sometimes|string|max:191',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'address' => 'nullable|string',
            'location' => 'nullable|string',
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ]);
        $w = AccWarehouse::query()->findOrFail($data['id']);
        $w->update($this->normalizeWarehouseInput(collect($data)->except('id')->all()));

        return $this->jsonPayload($request, ['ok' => true, 'warehouse' => $w->fresh()]);
    }

    public function warehousesDelete(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', ExistsForTenant::in('acc_warehouses')]]);
        AccWarehouse::query()->whereKey($data['id'])->delete();

        return $this->jsonPayload($request, ['ok' => true]);
    }

    public function productsIndex(Request $request): JsonResponse
    {
        $q = AccProduct::query()->orderBy('name');
        $perPage = min((int) $request->input('per_page', 50), 200);
        $paginator = $q->paginate($perPage);

        return $this->jsonList($request, $paginator->items(), $paginator->total());
    }

    public function warehouseStock(Request $request): JsonResponse
    {
        $q = AccWarehouseStock::query()->with(['warehouse', 'product']);
        if ($request->filled('warehouse_id')) {
            $q->where('warehouse_id', $request->input('warehouse_id'));
        }

        return $this->jsonPayload($request, $q->get());
    }

    public function warehouseStockByProduct(Request $request, int $warehouseId, int $productId): JsonResponse
    {
        $row = AccWarehouseStock::query()
            ->where('warehouse_id', $warehouseId)
            ->where('product_id', $productId)
            ->first();

        return $this->jsonPayload($request, ['quantity' => $row ? (float) $row->quantity : 0.0]);
    }

    public function outboundIndex(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()->where('type', 'outbound')->with('warehouse')->orderByDesc('id');
        $paginator = $q->paginate(min((int) $request->input('per_page', 25), 100));

        return $this->jsonList($request, $paginator->items(), $paginator->total());
    }

    public function outboundCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'number' => 'nullable|string|max:50',
            'document_date' => 'nullable|date',
            'items' => 'nullable|array',
        ]);
        $doc = AccWarehouseDocument::query()->create([
            'type' => 'outbound',
            'warehouse_id' => $data['warehouse_id'],
            'number' => $data['number'] ?? null,
            'document_date' => $data['document_date'] ?? now()->toDateString(),
            'status' => 'draft',
            'items' => $data['items'] ?? [],
            'created_by' => $request->user()?->id,
        ]);

        return $this->jsonPayload($request, ['id' => $doc->id], 201);
    }

    public function outboundPost(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', ExistsForTenant::in('acc_warehouse_documents')]]);
        $doc = AccWarehouseDocument::query()->where('type', 'outbound')->findOrFail($data['id']);

        DB::transaction(function () use ($doc) {
            $doc->update(['status' => 'posted']);
            foreach ($doc->items ?? [] as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $qty = (float) ($row['quantity'] ?? 0);
                if (! $pid || $qty <= 0) {
                    continue;
                }
                $stock = AccWarehouseStock::query()->firstOrCreate(
                    ['warehouse_id' => $doc->warehouse_id, 'product_id' => $pid],
                    ['quantity' => 0]
                );
                if ((float) $stock->quantity < $qty) {
                    throw new \RuntimeException(__('messages.insufficient_stock_for_product').$pid);
                }
                $stock->update(['quantity' => (float) $stock->quantity - $qty]);
            }
        });

        return $this->jsonPayload($request, ['posted' => true]);
    }

    public function outboundShow(Request $request, int $id): JsonResponse
    {
        $doc = AccWarehouseDocument::query()->where('type', 'outbound')->find($id);

        return $this->jsonPayload($request, $doc);
    }

    public function inboundIndex(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()->where('type', 'inbound')->with('warehouse')->orderByDesc('id');
        $paginator = $q->paginate(min((int) $request->input('per_page', 25), 100));

        return $this->jsonList($request, $paginator->items(), $paginator->total());
    }

    public function inboundCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'number' => 'nullable|string|max:50',
            'document_date' => 'nullable|date',
            'items' => 'nullable|array',
        ]);
        $doc = AccWarehouseDocument::query()->create([
            'type' => 'inbound',
            'warehouse_id' => $data['warehouse_id'],
            'number' => $data['number'] ?? null,
            'document_date' => $data['document_date'] ?? now()->toDateString(),
            'status' => 'draft',
            'items' => $data['items'] ?? [],
            'created_by' => $request->user()?->id,
        ]);

        return $this->jsonPayload($request, ['id' => $doc->id], 201);
    }

    public function inboundPost(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', ExistsForTenant::in('acc_warehouse_documents')]]);
        $doc = AccWarehouseDocument::query()->where('type', 'inbound')->findOrFail($data['id']);

        DB::transaction(function () use ($doc) {
            $doc->update(['status' => 'posted']);
            foreach ($doc->items ?? [] as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $qty = (float) ($row['quantity'] ?? 0);
                if (! $pid || $qty <= 0) {
                    continue;
                }
                $stock = AccWarehouseStock::query()->firstOrCreate(
                    ['warehouse_id' => $doc->warehouse_id, 'product_id' => $pid],
                    ['quantity' => 0]
                );
                $stock->update(['quantity' => (float) $stock->quantity + $qty]);
            }
        });

        return $this->jsonPayload($request, ['posted' => true]);
    }

    public function inboundShow(Request $request, int $id): JsonResponse
    {
        $doc = AccWarehouseDocument::query()->where('type', 'inbound')->find($id);

        return $this->jsonPayload($request, $doc);
    }

    public function auditIndex(Request $request): JsonResponse
    {
        $q = AccWarehouseDocument::query()->where('type', 'audit')->with('warehouse')->orderByDesc('id');
        $paginator = $q->paginate(min((int) $request->input('per_page', 25), 100));

        return $this->jsonList($request, $paginator->items(), $paginator->total());
    }

    public function auditCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'number' => 'nullable|string|max:50',
            'document_date' => 'nullable|date',
        ]);
        $doc = AccWarehouseDocument::query()->create([
            'type' => 'audit',
            'warehouse_id' => $data['warehouse_id'],
            'number' => $data['number'] ?? null,
            'document_date' => $data['document_date'] ?? now()->toDateString(),
            'status' => 'draft',
            'items' => [],
            'created_by' => $request->user()?->id,
        ]);

        return $this->jsonPayload($request, ['id' => $doc->id], 201);
    }

    public function auditRecord(Request $request): JsonResponse
    {
        $data = $request->validate([
            'document_id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
            'product_id' => ['required', ExistsForTenant::in('acc_products')],
            'counted' => 'required|numeric|min:0',
        ]);
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['document_id']);
        $items = $doc->items ?? [];
        $items[] = ['product_id' => (int) $data['product_id'], 'counted' => (float) $data['counted']];
        $doc->update(['items' => $items]);

        return $this->jsonPayload($request, ['recorded' => true]);
    }

    public function auditComplete(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', ExistsForTenant::in('acc_warehouse_documents')]]);
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['id']);
        $doc->update(['status' => 'completed']);

        return $this->jsonPayload($request, ['completed' => true]);
    }

    public function auditPost(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', ExistsForTenant::in('acc_warehouse_documents')]]);
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['id']);

        DB::transaction(function () use ($doc) {
            foreach ($doc->items ?? [] as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $counted = isset($row['counted']) ? (float) $row['counted'] : null;
                if (! $pid || $counted === null) {
                    continue;
                }
                $stock = AccWarehouseStock::query()->firstOrCreate(
                    ['warehouse_id' => $doc->warehouse_id, 'product_id' => $pid],
                    ['quantity' => 0]
                );
                $stock->update(['quantity' => $counted]);
            }
            $doc->update(['status' => 'posted']);
        });

        return $this->jsonPayload($request, ['posted' => true]);
    }

    public function auditShow(Request $request, int $id): JsonResponse
    {
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->find($id);

        return $this->jsonPayload($request, $doc);
    }
}
