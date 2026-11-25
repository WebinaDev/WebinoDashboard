<?php

namespace App\Services\Stock;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The buying path: request → approval → purchase order → goods receipt with QC.
 *
 * None of it existed. A shop could record that stock appeared, but not that anybody had asked
 * for it, who approved the spend, or whether what arrived was what was ordered. That is fine
 * until the first month where the food cost looks wrong and nobody can say whether the
 * supplier overcharged, the kitchen over-ordered, or the delivery was short.
 *
 * The rules that matter, and why:
 *
 *  - **Approval is separated from requesting.** The person who wants the goods is the last
 *    person who should be able to authorise the spend alone. `purchasing.approve` is its own
 *    capability for exactly that reason.
 *  - **Goods only enter stock through a receipt that has passed QC.** Receiving straight from
 *    an order would let a delivery be "accepted" before anyone looked at it, and the first
 *    thing anyone would notice was a menu cost that had silently doubled.
 *  - **A short delivery leaves the order open**, with the shortfall named, rather than closing
 *    it at whatever arrived. An order that closes short is a discrepancy nobody can find later.
 */
final class Purchasing
{
    public function __construct(private readonly StockLedger $stock) {}

    /**
     * @param  list<array{product_id: int, quantity: float, unit?: string|null, estimated_unit_cost_minor?: float|null, note?: string|null}>  $items
     * @return array{document_id: int, number: string}
     */
    public function createRequest(int $tenantId, array $items, ?int $warehouseId, ?int $userId, array $meta = []): array
    {
        if ($items === []) {
            throw ValidationException::withMessages(['items' => __('api.purchase_items_required')]);
        }

        return DB::transaction(function () use ($tenantId, $items, $warehouseId, $userId, $meta): array {
            $id = (int) DB::table('purchase_requests')->insertGetId([
                'tenant_id' => $tenantId,
                'warehouse_id' => $warehouseId,
                'number' => $this->nextNumber($tenantId, 'purchase_requests', 'PR'),
                'status' => 'submitted',
                'needed_by' => $meta['needed_by'] ?? null,
                'notes' => $meta['notes'] ?? null,
                'requested_by' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($items as $item) {
                DB::table('purchase_request_items')->insert([
                    'tenant_id' => $tenantId,
                    'request_id' => $id,
                    'product_id' => (int) $item['product_id'],
                    'quantity' => (float) $item['quantity'],
                    'unit' => $item['unit'] ?? null,
                    'estimated_unit_cost_minor' => $item['estimated_unit_cost_minor'] ?? null,
                    'note' => $item['note'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return [
                'document_id' => $id,
                'number' => (string) DB::table('purchase_requests')->where('id', $id)->value('number'),
            ];
        });
    }

    /**
     * Approve or reject a request. A rejection needs a reason: "no" without a why is how the
     * same request comes back next week.
     */
    public function decideRequest(int $tenantId, int $requestId, bool $approve, ?int $userId, ?string $note = null): array
    {
        $request = DB::table('purchase_requests')->where('tenant_id', $tenantId)->where('id', $requestId)->first();

        if ($request === null) {
            throw ValidationException::withMessages(['request' => __('api.purchase_request_not_found')]);
        }

        if (! in_array((string) $request->status, ['draft', 'submitted'], true)) {
            throw ValidationException::withMessages([
                'request' => __('api.purchase_request_already_decided'),
            ]);
        }

        $reason = trim((string) $note);

        if (! $approve && $reason === '') {
            throw ValidationException::withMessages([
                'decision_note' => __('api.purchase_rejection_needs_reason'),
            ]);
        }

        DB::table('purchase_requests')->where('id', $requestId)->update([
            'status' => $approve ? 'approved' : 'rejected',
            'decided_by' => $userId,
            'decided_at' => now(),
            'decision_note' => $reason !== '' ? $reason : null,
            'updated_at' => now(),
        ]);

        return ['status' => $approve ? 'approved' : 'rejected'];
    }

    /**
     * Turn an approved request into an order for a supplier.
     *
     * Prices come from the request's estimates when they exist, otherwise the item's current
     * average cost. Either is a guess; the guess has to be written down so the difference at
     * receipt time is visible rather than absorbed.
     *
     * @param  array<string, float>  $prices  product_id => unit cost, overriding the estimate
     */
    public function createOrder(int $tenantId, int $requestId, ?int $supplierId, ?int $userId, array $prices = []): array
    {
        return DB::transaction(function () use ($tenantId, $requestId, $supplierId, $userId, $prices): array {
            $request = DB::table('purchase_requests')->where('tenant_id', $tenantId)->where('id', $requestId)->first();

            if ($request === null) {
                throw ValidationException::withMessages(['request' => __('api.purchase_request_not_found')]);
            }

            if ((string) $request->status !== 'approved') {
                throw ValidationException::withMessages(['request' => __('api.purchase_request_needs_approval')]);
            }

            $items = DB::table('purchase_request_items')->where('request_id', $requestId)->get();

            $id = (int) DB::table('purchase_orders')->insertGetId([
                'tenant_id' => $tenantId,
                'request_id' => $requestId,
                'supplier_id' => $supplierId,
                'warehouse_id' => $request->warehouse_id,
                'number' => $this->nextNumber($tenantId, 'purchase_orders', 'PO'),
                'status' => 'sent',
                'ordered_on' => now()->toDateString(),
                'created_by' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $total = 0.0;

            foreach ($items as $item) {
                $unitCost = (float) ($prices[(string) $item->product_id] ?? $item->estimated_unit_cost_minor ?? 0);
                $total += $unitCost * (float) $item->quantity;

                DB::table('purchase_order_items')->insert([
                    'tenant_id' => $tenantId,
                    'order_id' => $id,
                    'product_id' => (int) $item->product_id,
                    'quantity' => (float) $item->quantity,
                    'received_quantity' => 0,
                    'unit_cost_minor' => $unitCost,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('purchase_orders')->where('id', $id)->update([
                'total_minor' => round($total, 4),
                'updated_at' => now(),
            ]);

            DB::table('purchase_requests')->where('id', $requestId)->update([
                'status' => 'ordered',
                'updated_at' => now(),
            ]);

            return ['order_id' => $id, 'total_minor' => round($total, 4)];
        });
    }

    /**
     * Goods arrive and are inspected.
     *
     * Only after QC passes does stock move. `$lines` may be a subset of the order — a delivery
     * can come in two vans — so the order stays open until every line is complete.
     *
     * @param  list<array{order_item_id: int, quantity: float, unit_cost_minor?: float|null, batch_no?: string|null, expires_on?: string|null, slot?: string|null, note?: string|null}>  $lines
     */
    public function receiveOrder(int $tenantId, int $orderId, array $lines, ?int $userId, array $meta = []): array
    {
        if ($lines === []) {
            throw ValidationException::withMessages(['items' => __('api.purchase_items_required')]);
        }

        $qcPassed = (bool) ($meta['qc_passed'] ?? true);
        $qcNote = trim((string) ($meta['qc_note'] ?? ''));

        // A rejection has to say what was wrong, or the supplier cannot be asked to fix it.
        if (! $qcPassed && $qcNote === '') {
            throw ValidationException::withMessages([
                'qc_note' => __('api.purchase_qc_rejection_needs_note'),
            ]);
        }

        return DB::transaction(function () use ($tenantId, $orderId, $lines, $userId, $qcPassed, $qcNote): array {
            $order = DB::table('purchase_orders')->where('tenant_id', $tenantId)->where('id', $orderId)->first();

            if ($order === null) {
                throw ValidationException::withMessages(['order' => __('api.purchase_order_not_found')]);
            }

            if (in_array((string) $order->status, ['received', 'cancelled'], true)) {
                throw ValidationException::withMessages(['order' => __('api.purchase_order_closed')]);
            }

            $receiptId = (int) DB::table('purchase_receipts')->insertGetId([
                'tenant_id' => $tenantId,
                'order_id' => $orderId,
                'number' => $this->nextNumber($tenantId, 'purchase_receipts', 'GRN'),
                'received_on' => now()->toDateString(),
                'qc_status' => $qcPassed ? 'passed' : 'rejected',
                'qc_note' => $qcNote !== '' ? $qcNote : null,
                'received_by' => $userId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $stocked = [];

            foreach ($lines as $line) {
                $orderItem = DB::table('purchase_order_items')
                    ->where('order_id', $orderId)
                    ->where('id', (int) $line['order_item_id'])
                    ->first();

                if ($orderItem === null) {
                    continue;
                }

                $quantity = (float) $line['quantity'];
                $unitCost = (float) ($line['unit_cost_minor'] ?? $orderItem->unit_cost_minor);

                DB::table('purchase_receipt_items')->insert([
                    'tenant_id' => $tenantId,
                    'receipt_id' => $receiptId,
                    'order_item_id' => (int) $orderItem->id,
                    'product_id' => (int) $orderItem->product_id,
                    'quantity' => $quantity,
                    'unit_cost_minor' => $unitCost,
                    'batch_no' => $line['batch_no'] ?? null,
                    'expires_on' => $line['expires_on'] ?? null,
                    'slot' => $line['slot'] ?? null,
                    'note' => $line['note'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if (! $qcPassed) {
                    // Recorded as having arrived and been refused: the paperwork exists, the
                    // stock does not. The order stays open so it can be delivered again.
                    continue;
                }

                $result = $this->stock->receive(
                    $tenantId,
                    (int) $orderItem->product_id,
                    $quantity,
                    $unitCost,
                    [
                        'warehouse_id' => $order->warehouse_id,
                        'batch_no' => $line['batch_no'] ?? null,
                        'expires_on' => $line['expires_on'] ?? null,
                        'slot' => $line['slot'] ?? null,
                        'reference_type' => 'purchase_receipt',
                        'reference_id' => $receiptId,
                        'note' => __('api.purchase_receipt_note', ['number' => (string) $order->number]),
                    ],
                );

                DB::table('purchase_order_items')->where('id', $orderItem->id)->update([
                    'received_quantity' => (float) $orderItem->received_quantity + $quantity,
                    'updated_at' => now(),
                ]);

                $stocked[] = ['product_id' => (int) $orderItem->product_id, 'journal_entry_id' => $result['journal_entry_id']];
            }

            // Closed only when every line has arrived in full. Anything else stays open, with
            // the shortfall visible on the order rather than forgotten.
            $remaining = (float) DB::table('purchase_order_items')
                ->where('order_id', $orderId)
                ->selectRaw('COALESCE(SUM(quantity - received_quantity),0) as remaining')
                ->value('remaining');

            DB::table('purchase_orders')->where('id', $orderId)->update([
                'status' => $remaining <= 0.0001 ? 'received' : 'partially_received',
                'updated_at' => now(),
            ]);

            return [
                'receipt_id' => $receiptId,
                'qc_status' => $qcPassed ? 'passed' : 'rejected',
                'remaining_quantity' => round(max(0.0, $remaining), 4),
                'stocked' => $stocked,
            ];
        });
    }

    /** What to buy next. Thin wrapper so the controller has one dependency. */
    public function suggestions(int $tenantId): array
    {
        return $this->stock->reorderSuggestions($tenantId);
    }

    private function nextNumber(int $tenantId, string $table, string $prefix): string
    {
        $count = (int) DB::table($table)->where('tenant_id', $tenantId)->count() + 1;

        return $prefix.'-'.str_pad((string) $count, 5, '0', STR_PAD_LEFT);
    }
}
