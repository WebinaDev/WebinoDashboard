<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Stock\Purchasing;
use App\Services\Stock\Production;
use App\Services\Stock\StockOpening;
use App\Services\Stock\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The stock screens: what arrived, what left and why, what is expiring, what to buy.
 *
 * Every write goes through {@see StockLedger} so the ledger and the books move together —
 * there is deliberately no path here that changes a quantity without posting its value.
 */
class StockController extends Controller
{
    public function __construct(
        private readonly StockLedger $stock,
        private readonly Purchasing $purchasing,
        private readonly StockOpening $opening,
        private readonly Production $production,
    ) {}

    /** Goods in (opening balance, an adjustment, or a delivery recorded by hand). */
    public function receive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'unit_cost_minor' => ['required', 'numeric', 'min:0'],
            'warehouse_id' => ['nullable', 'integer'],
            'batch_no' => ['nullable', 'string', 'max:64'],
            'expires_on' => ['nullable', 'date'],
            'slot' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:255'],
            'document_date' => ['nullable', 'date'],
        ]);

        $result = $this->stock->receive(
            (int) $request->user()->tenant_id,
            (int) $data['product_id'],
            (float) $data['quantity'],
            (float) $data['unit_cost_minor'],
            $data,
        );

        return response()->json(['data' => $result], 201);
    }

    /** Waste, spoilage, staff meal — a reason is required, and it is required all the way down. */
    public function waste(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'reason' => ['required', 'string', 'max:191'],
            'kind' => ['nullable', Rule::in(['waste', 'spoilage', 'staff_meal', 'other'])],
            'warehouse_id' => ['nullable', 'integer'],
            'batch_no' => ['nullable', 'string', 'max:64'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->stock->issue(
            (int) $request->user()->tenant_id,
            (int) $data['product_id'],
            (float) $data['quantity'],
            $data['reason'],
            $data,
        );

        return response()->json(['data' => $result], 201);
    }

    /** A physical count. Only the difference is posted. */
    public function count(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'counted_quantity' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->stock->count(
            (int) $request->user()->tenant_id,
            (int) $data['product_id'],
            (float) $data['counted_quantity'],
            ['note' => $data['note'] ?? null, 'reference_type' => 'manual_count'],
        );

        return response()->json(['data' => $result]);
    }

    /** Between stores: value does not change, so nothing is posted to the books. */
    public function transfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'from_warehouse_id' => ['required', 'integer'],
            'to_warehouse_id' => ['required', 'integer', 'different:from_warehouse_id'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->stock->transfer(
            (int) $request->user()->tenant_id,
            (int) $data['product_id'],
            (int) $data['from_warehouse_id'],
            (int) $data['to_warehouse_id'],
            (float) $data['quantity'],
            ['note' => $data['note'] ?? null, 'reference_type' => 'manual_transfer'],
        );

        return response()->json(['data' => $result], 201);
    }

    /**
     * Opening stock from a CSV/TSV sheet, in two steps.
     *
     * The preview writes nothing and reports every row it cannot accept with its line number;
     * the commit receives the parseable rows through the ledger, so each one posts its journal
     * and enters the weighted-average cost engine exactly as a purchase would.
     */
    public function openingPreview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string'],
            'map' => ['nullable', 'array'],
            'map.*' => ['string', 'max:64'],
        ]);

        return response()->json(['data' => $this->opening->preview(
            (int) $request->user()->tenant_id,
            (string) $data['body'],
            is_array($data['map'] ?? null) ? $data['map'] : [],
        )]);
    }

    public function openingCommit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string'],
            'map' => ['nullable', 'array'],
            'map.*' => ['string', 'max:64'],
            'document_date' => ['nullable', 'date'],
        ]);

        $result = $this->opening->commit(
            (int) $request->user()->tenant_id,
            (string) $data['body'],
            is_array($data['map'] ?? null) ? $data['map'] : [],
            (int) $request->user()->id,
            $data['document_date'] ?? null,
        );

        return response()->json(['data' => $result, 'message' => __('api.stock_opening_done', ['count' => $result['received']])]);
    }

    /** What expires within `days`, soonest first. */
    public function expiring(Request $request): JsonResponse
    {
        $days = max(0, min(365, (int) $request->input('days', 7)));

        return response()->json([
            'data' => [
                'days' => $days,
                'batches' => $this->stock->expiring((int) $request->user()->tenant_id, $days),
            ],
        ]);
    }

    /* ------------------------------------------------------- production --- */

    /** Recipe runs: what was made from what, and what it cost. */
    public function productionIndex(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->production->recent(
                (int) $request->user()->tenant_id,
                (int) $request->query('limit', 25),
            ),
        ]);
    }

    /**
     * Plan a run from the output's recipe. Writes a draft, touches no stock.
     *
     * A draft is deliberately free of side effects: it is the screen that lets somebody notice
     * the recipe yields 12 and they made 40, before the flour has left the shelf.
     */
    public function productionDraft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'output_id' => ['required', 'integer', 'min:1'],
            'produced_quantity' => ['required', 'numeric', 'gt:0'],
            'recipe_yield' => ['nullable', 'numeric', 'gt:0'],
            'warehouse_id' => ['nullable', 'integer'],
            'batch_no' => ['nullable', 'string', 'max:64'],
            'expires_on' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json([
            'data' => $this->production->draft(
                (int) $request->user()->tenant_id,
                (int) $data['output_id'],
                (float) $data['produced_quantity'],
                $data + ['created_by' => (int) $request->user()->id],
            ),
        ], 201);
    }

    /** Commit a run: consume the inputs and receive the output, together or not at all. */
    public function productionComplete(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->production->complete((int) $request->user()->tenant_id, $id),
        ]);
    }

    /** What went to waste, by cause and by item, for a period. */
    public function wasteReport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return response()->json([
            'data' => $this->stock->wasteReport(
                (int) $request->user()->tenant_id,
                $data['from'] ?? null,
                $data['to'] ?? null,
            ),
        ]);
    }

    /** The shopping list, from the reorder points the shop already set. */
    public function reorder(Request $request): JsonResponse
    {
        return response()->json([
            'data' => ['suggestions' => $this->purchasing->suggestions((int) $request->user()->tenant_id)],
        ]);
    }

    // --- purchasing -------------------------------------------------------------------

    public function createRequest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer'],
            'needed_by' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit' => ['nullable', 'string', 'max:20'],
            'items.*.estimated_unit_cost_minor' => ['nullable', 'numeric', 'min:0'],
            'items.*.note' => ['nullable', 'string', 'max:191'],
        ]);

        $result = $this->purchasing->createRequest(
            (int) $request->user()->tenant_id,
            $data['items'],
            isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null,
            (int) $request->user()->id,
            ['needed_by' => $data['needed_by'] ?? null, 'notes' => $data['notes'] ?? null],
        );

        return response()->json(['data' => $result], 201);
    }

    public function decideRequest(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'approve' => ['required', 'boolean'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json(['data' => $this->purchasing->decideRequest(
            (int) $request->user()->tenant_id,
            $id,
            (bool) $data['approve'],
            (int) $request->user()->id,
            $data['note'] ?? null,
        )]);
    }

    public function createOrder(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['nullable', 'integer'],
            'prices' => ['nullable', 'array'],
        ]);

        return response()->json(['data' => $this->purchasing->createOrder(
            (int) $request->user()->tenant_id,
            $id,
            isset($data['supplier_id']) ? (int) $data['supplier_id'] : null,
            (int) $request->user()->id,
            $data['prices'] ?? [],
        )], 201);
    }

    public function receiveOrder(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'qc_passed' => ['sometimes', 'boolean'],
            'qc_note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.order_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_cost_minor' => ['nullable', 'numeric', 'min:0'],
            'items.*.batch_no' => ['nullable', 'string', 'max:64'],
            'items.*.expires_on' => ['nullable', 'date'],
            'items.*.slot' => ['nullable', 'string', 'max:64'],
            'items.*.note' => ['nullable', 'string', 'max:191'],
        ]);

        $result = $this->purchasing->receiveOrder(
            (int) $request->user()->tenant_id,
            $id,
            $data['items'],
            (int) $request->user()->id,
            [
                'qc_passed' => $data['qc_passed'] ?? true,
                'qc_note' => $data['qc_note'] ?? null,
            ],
        );

        return response()->json(['data' => $result], 201);
    }
}
