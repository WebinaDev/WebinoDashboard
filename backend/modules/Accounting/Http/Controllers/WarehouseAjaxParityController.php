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
 * Parity with wp_ajax_webino_* warehouse handlers
 * (see webinocrm class-accounting-warehouse-module.php).
 *
 * POST /api/v1/accounting/warehouse-ajax/{action}
 */
class WarehouseAjaxParityController extends Controller
{
    /** @var list<string> */
    private const ACTIONS = [
        'get_warehouses', 'create_warehouse', 'update_warehouse', 'delete_warehouse',
        'warehouses_create', 'warehouses_update', 'warehouses_delete',
        'create_inbound', 'get_inbound', 'add_inbound_item', 'post_inbound',
        'create_outbound', 'get_outbound', 'add_outbound_item', 'post_outbound',
        'create_audit', 'get_audit', 'initialize_audit_items', 'record_audit_item', 'complete_audit', 'post_audit',
        'warehouse_document_create', 'warehouse_document_post',
        'get_warehouse_stock', 'get_stock_report', 'get_movement_report', 'get_low_stock_items',
    ];

    public function handle(Request $request, string $action): JsonResponse
    {
        if (! in_array($action, self::ACTIONS, true)) {
            return response()->json([
                'error' => ['code' => 'UNKNOWN_WAREHOUSE_ACTION', 'message' => $action],
            ], 404);
        }

        $p = $request->except([
            'password', 'token', 'authorization', 'cookie', 'current_password',
            'private_key', 'secret', 'api_key', 'access_token',
        ]);

        try {
            $data = match ($action) {
                'get_warehouses' => ['warehouses' => AccWarehouse::query()->orderBy('name')->get()->all()],
                'create_warehouse', 'warehouses_create' => $this->createWarehouse($p),
                'update_warehouse', 'warehouses_update' => $this->updateWarehouse($p),
                'delete_warehouse', 'warehouses_delete' => $this->deleteWarehouse($p),
                'create_inbound' => $this->createDoc($p, 'inbound', $request),
                'get_inbound' => $this->getDoc($p, 'inbound'),
                'add_inbound_item' => $this->addItem($p, 'inbound'),
                'post_inbound' => $this->postDoc($p, 'inbound', true),
                'create_outbound' => $this->createDoc($p, 'outbound', $request),
                'get_outbound' => $this->getDoc($p, 'outbound'),
                'add_outbound_item' => $this->addItem($p, 'outbound'),
                'post_outbound' => $this->postDoc($p, 'outbound', false),
                'create_audit' => $this->createDoc($p, 'audit', $request),
                'get_audit' => $this->getDoc($p, 'audit'),
                'initialize_audit_items' => $this->initAudit($p),
                'record_audit_item' => $this->recordAuditItem($p),
                'complete_audit' => $this->completeAudit($p),
                'post_audit' => $this->postAudit($p),
                'warehouse_document_create' => $this->createDoc(
                    $p,
                    in_array(($p['type'] ?? ''), ['inbound', 'outbound', 'audit'], true) ? (string) $p['type'] : 'inbound',
                    $request
                ),
                'warehouse_document_post' => $this->postLegacyDoc($p),
                'get_warehouse_stock' => $this->stockReport($p),
                'get_stock_report' => $this->stockReport($p),
                'get_movement_report' => $this->movementReport($p),
                'get_low_stock_items' => $this->lowStock($p),
            };
        } catch (\Throwable $e) {
            return response()->json([
                'error' => ['code' => 'WAREHOUSE_ERROR', 'message' => $e->getMessage()],
            ], 422);
        }

        return response()->json(['data' => $data]);
    }

    private function postLegacyDoc(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        $doc = AccWarehouseDocument::query()->findOrFail($id);
        if ($doc->type === 'audit') {
            return $this->postAudit(['id' => $id]);
        }

        return $this->postDoc(['id' => $id], (string) $doc->type, $doc->type === 'inbound');
    }

    private function createWarehouse(array $p): array
    {
        $data = validator($p, [
            'name' => 'required|string|max:191',
            'address' => 'nullable|string',
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ])->validate();

        $w = AccWarehouse::query()->create($data);

        return ['id' => $w->id, 'warehouse' => $w];
    }

    private function updateWarehouse(array $p): array
    {
        $data = validator($p, [
            'id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'name' => 'sometimes|string|max:191',
            'address' => 'nullable|string',
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ])->validate();

        $w = AccWarehouse::query()->findOrFail($data['id']);
        $w->update(collect($data)->except('id')->all());

        return ['ok' => true, 'warehouse' => $w->fresh()];
    }

    private function deleteWarehouse(array $p): array
    {
        $id = (int) ($p['id'] ?? 0);
        AccWarehouse::query()->whereKey($id)->delete();

        return ['ok' => true];
    }

    private function createDoc(array $p, string $type, Request $request): array
    {
        $data = validator($p, [
            'warehouse_id' => ['required', ExistsForTenant::in('acc_warehouses')],
            'number' => 'nullable|string|max:50',
            'document_date' => 'nullable|date',
            'reference' => 'nullable|string|max:191',
            'notes' => 'nullable|string',
            'items' => 'nullable|array',
        ])->validate();

        $doc = AccWarehouseDocument::query()->create([
            'type' => $type,
            'warehouse_id' => $data['warehouse_id'],
            'number' => $data['number'] ?? null,
            'document_date' => $data['document_date'] ?? now()->toDateString(),
            'status' => 'draft',
            'reference' => $data['reference'] ?? null,
            'items' => $data['items'] ?? [],
            'notes' => $data['notes'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return ['id' => $doc->id, 'document' => $doc];
    }

    private function getDoc(array $p, string $type): array
    {
        $id = (int) ($p['id'] ?? $p['document_id'] ?? 0);
        $doc = AccWarehouseDocument::query()->where('type', $type)->find($id);

        return ['document' => $doc];
    }

    private function addItem(array $p, string $type): array
    {
        $data = validator($p, [
            'document_id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
            'product_id' => ['required', ExistsForTenant::in('acc_products')],
            'quantity' => 'required|numeric|min:0.0001',
            'unit_cost' => 'nullable|numeric',
        ])->validate();

        $doc = AccWarehouseDocument::query()->where('type', $type)->findOrFail($data['document_id']);
        $items = $doc->items ?? [];
        $items[] = [
            'product_id' => (int) $data['product_id'],
            'quantity' => (float) $data['quantity'],
            'unit_cost' => $data['unit_cost'] ?? null,
        ];
        $doc->update(['items' => $items]);

        return ['document' => $doc->fresh()];
    }

    private function postDoc(array $p, string $type, bool $inbound): array
    {
        $data = validator($p, [
            'id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
        ])->validate();

        $doc = AccWarehouseDocument::query()->where('type', $type)->findOrFail($data['id']);

        return DB::transaction(function () use ($doc, $inbound) {
            $doc->update(['status' => 'posted']);
            $items = $doc->items ?? [];
            foreach ($items as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $qty = (float) ($row['quantity'] ?? 0);
                if (! $pid || $qty <= 0) {
                    continue;
                }
                $stock = AccWarehouseStock::query()->firstOrCreate(
                    ['warehouse_id' => $doc->warehouse_id, 'product_id' => $pid],
                    ['quantity' => 0, 'reorder_point' => null]
                );
                $delta = $inbound ? $qty : -$qty;
                if (! $inbound && (float) $stock->quantity + $delta < 0) {
                    throw new \RuntimeException(__('api.insufficient_stock_for_product').$pid);
                }
                $stock->update(['quantity' => (float) $stock->quantity + $delta]);
            }

            return ['posted' => true, 'document' => $doc->fresh()];
        });
    }

    private function initAudit(array $p): array
    {
        $data = validator($p, [
            'document_id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
        ])->validate();
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['document_id']);
        $products = AccProduct::query()->pluck('id');
        $items = [];
        foreach ($products as $pid) {
            $items[] = ['product_id' => $pid, 'counted' => null];
        }
        $doc->update(['items' => $items]);

        return ['document' => $doc->fresh()];
    }

    private function recordAuditItem(array $p): array
    {
        $data = validator($p, [
            'document_id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
            'product_id' => ['required', ExistsForTenant::in('acc_products')],
            'counted' => 'required|numeric|min:0',
        ])->validate();
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['document_id']);
        $items = $doc->items ?? [];
        foreach ($items as &$it) {
            if ((int) ($it['product_id'] ?? 0) === (int) $data['product_id']) {
                $it['counted'] = (float) $data['counted'];
                break;
            }
        }
        unset($it);
        $doc->update(['items' => $items]);

        return ['document' => $doc->fresh()];
    }

    private function completeAudit(array $p): array
    {
        $data = validator($p, [
            'document_id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
        ])->validate();
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['document_id']);
        $doc->update(['status' => 'completed']);

        return ['document' => $doc->fresh()];
    }

    private function postAudit(array $p): array
    {
        $data = validator($p, [
            'id' => ['required', ExistsForTenant::in('acc_warehouse_documents')],
        ])->validate();

        return DB::transaction(function () use ($data) {
            $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($data['id']);
            $items = $doc->items ?? [];
            foreach ($items as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $counted = null;
                if (isset($row['counted'])) {
                    $counted = (float) $row['counted'];
                } elseif (isset($row['quantity'])) {
                    $counted = (float) $row['quantity'];
                }
                if (! $pid || $counted === null) {
                    continue;
                }
                $stock = AccWarehouseStock::query()->firstOrCreate(
                    ['warehouse_id' => $doc->warehouse_id, 'product_id' => $pid],
                    ['quantity' => 0, 'reorder_point' => null]
                );
                $stock->update(['quantity' => $counted]);
            }
            $doc->update(['status' => 'posted']);

            return ['posted' => true, 'document' => $doc->fresh()];
        });
    }

    private function stockReport(array $p): array
    {
        $q = AccWarehouseStock::query()->with(['warehouse', 'product']);
        if (! empty($p['warehouse_id'])) {
            $q->where('warehouse_id', $p['warehouse_id']);
        }

        return ['items' => $q->orderBy('warehouse_id')->get()->all()];
    }

    private function movementReport(array $p): array
    {
        $q = AccWarehouseDocument::query()->with('warehouse')->orderByDesc('id')->limit(100);

        return ['documents' => $q->get()->all()];
    }

    private function lowStock(array $p): array
    {
        $rows = AccWarehouseStock::query()
            ->with(['product', 'warehouse'])
            ->whereNotNull('reorder_point')
            ->whereColumn('quantity', '<=', 'reorder_point')
            ->get();

        return ['items' => $rows->all()];
    }
}
