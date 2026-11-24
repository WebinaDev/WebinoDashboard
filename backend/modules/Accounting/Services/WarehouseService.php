<?php

namespace Modules\Accounting\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\AccProduct;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Entities\AccWarehouseDocument;
use Modules\Accounting\Entities\AccWarehouseStock;
use Modules\Accounting\Support\ExistsForTenant;

class WarehouseService
{
    public function updateWarehouse(array $p): array
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

        return ['warehouse' => $w->fresh()];
    }

    public function deleteWarehouse(int $id): array
    {
        AccWarehouse::query()->whereKey($id)->delete();

        return ['deleted' => true];
    }

    public function createDocument(array $p, string $type, ?int $userId): array
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
            'created_by' => $userId,
        ]);

        return ['id' => $doc->id, 'document' => $doc];
    }

    public function getDocument(int $id, string $type): array
    {
        $doc = AccWarehouseDocument::query()->where('type', $type)->findOrFail($id);

        return ['document' => $doc];
    }

    /**
     * Post a warehouse document into the stock ledger.
     *
     * This used to write `acc_warehouse_stock` directly, which is why the shop had two stock
     * figures that disagreed and a purchase that never reached the books. It now goes through
     * {@see \App\Services\Stock\StockLedger}, so the movement is appended to the ledger, the
     * weighted average moves, the value posts a journal, and `acc_warehouse_stock` is
     * recomputed from the ledger instead of being a second opinion.
     */
    public function postDocument(int $id, string $type, bool $inbound, ?int $tenantId = null): array
    {
        $doc = AccWarehouseDocument::query()->where('type', $type)->findOrFail($id);
        $tenantId ??= (int) $doc->tenant_id;
        $ledger = app(\App\Services\Stock\StockLedger::class);

        return DB::transaction(function () use ($doc, $inbound, $tenantId, $ledger): array {
            $doc->update(['status' => 'posted']);
            foreach ($doc->items ?? [] as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $qty = (float) ($row['quantity'] ?? 0);
                if (! $pid || $qty <= 0) {
                    continue;
                }

                $meta = [
                    'warehouse_id' => (int) $doc->warehouse_id,
                    'reference_type' => 'warehouse_document',
                    'reference_id' => (int) $doc->id,
                    'note' => $doc->number ?? null,
                ];

                if ($inbound) {
                    // A document with no price still has to move stock; it just does not move
                    // value, and the ledger records that instead of inventing a cost.
                    $ledger->receive($tenantId, $pid, $qty, (float) ($row['unit_cost'] ?? 0), $meta);

                    continue;
                }

                $ledger->issue($tenantId, $pid, $qty, 'خروج انبار — '.((string) ($doc->number ?? $doc->id)), $meta);
            }

            return ['posted' => true, 'document' => $doc->fresh()];
        });
    }

    public function createAudit(array $p, ?int $userId): array
    {
        return $this->createDocument($p, 'audit', $userId);
    }

    public function recordAuditItem(array $p): array
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

    public function completeAudit(int $documentId): array
    {
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($documentId);
        $doc->update(['status' => 'completed']);

        return ['document' => $doc->fresh()];
    }

    /**
     * Post a stock count.
     *
     * The difference posts, not the counted figure: setting the quantity directly throws away
     * the movement, and with it the only evidence of how much was missing.
     */
    public function postAudit(int $id): array
    {
        $doc = AccWarehouseDocument::query()->where('type', 'audit')->findOrFail($id);
        $tenantId = (int) $doc->tenant_id;
        $ledger = app(\App\Services\Stock\StockLedger::class);

        return DB::transaction(function () use ($doc, $tenantId, $ledger): array {
            foreach ($doc->items ?? [] as $row) {
                $pid = (int) ($row['product_id'] ?? 0);
                $counted = isset($row['counted']) ? (float) $row['counted'] : null;
                if (! $pid || $counted === null) {
                    continue;
                }

                $ledger->count($tenantId, $pid, $counted, [
                    'warehouse_id' => (int) $doc->warehouse_id,
                    'reference_type' => 'warehouse_audit',
                    'reference_id' => (int) $doc->id,
                    'note' => 'شمارش انبار — '.((string) ($doc->number ?? $doc->id)),
                ]);
            }
            $doc->update(['status' => 'posted']);

            return ['posted' => true, 'document' => $doc->fresh()];
        });
    }

    public function stockForProduct(int $warehouseId, int $productId): array
    {
        $stock = AccWarehouseStock::query()
            ->where('warehouse_id', $warehouseId)
            ->where('product_id', $productId)
            ->first();

        return ['stock' => $stock];
    }
}
