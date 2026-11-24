<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Catalog\RecipeCosting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Recipes (bills of materials) and the cost that comes out of them.
 *
 * A menu screen shows a price; this is what the kitchen actually consumes to earn it. The
 * endpoints are shaped for the two things people really do here: build a recipe once, and
 * change ingredient prices every week.
 */
class RecipeController extends Controller
{
    public function __construct(private readonly RecipeCosting $costing) {}

    /** The recipe for one menu item, with costs rolled up. */
    public function show(Request $request, int $product): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $model = Product::query()->where('tenant_id', $tenantId)->findOrFail($product);

        $cost = $this->costing->plateCost($tenantId, RecipeCosting::SUBJECT_PRODUCT, $model->id);

        return response()->json([
            'data' => [
                'product' => [
                    'id' => $model->id,
                    'name' => $model->name,
                    'price_minor' => (int) $model->price_minor,
                    'purchase_price_minor' => $model->purchase_price_minor === null ? null : (int) $model->purchase_price_minor,
                    'cost_is_estimated' => (bool) ($model->cost_is_estimated ?? false),
                ],
                'lines' => $cost['lines'],
                'unit_cost_minor' => $cost['unit_cost_minor'],
                'complete' => $cost['complete'],
                'missing' => $cost['missing'],
                'margin' => $this->margin((int) $model->price_minor, $cost['unit_cost_minor']),
            ],
        ]);
    }

    /**
     * Replace a product's recipe in one call.
     *
     * Replace rather than patch: a recipe is a document, and a half-applied one produces a
     * cost that matches neither the old version nor the new.
     */
    public function save(Request $request, int $product): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $model = Product::query()->where('tenant_id', $tenantId)->findOrFail($product);

        $data = $request->validate([
            'lines' => ['present', 'array', 'max:200'],
            'lines.*.component_type' => ['required', Rule::in([
                RecipeCosting::SUBJECT_PRODUCT,
                RecipeCosting::SUBJECT_ACC_PRODUCT,
                RecipeCosting::SUBJECT_MODIFIER_OPTION,
            ])],
            'lines.*.component_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'lines.*.waste_percent' => ['nullable', 'numeric', 'min:0', 'max:99'],
            'lines.*.unit' => ['nullable', 'string', 'max:20'],
            'lines.*.note' => ['nullable', 'string', 'max:191'],
        ]);

        $subjectType = (string) $request->input('subject_type', RecipeCosting::SUBJECT_PRODUCT);
        $subjectId = (int) $request->input('subject_id', $model->id);

        DB::transaction(function () use ($tenantId, $subjectType, $subjectId, $data): void {
            DB::table('recipe_lines')
                ->where('tenant_id', $tenantId)
                ->where('subject_type', $subjectType)
                ->where('subject_id', $subjectId)
                ->delete();

            $order = 0;
            foreach ($data['lines'] as $line) {
                $order++;
                DB::table('recipe_lines')->insert([
                    'tenant_id' => $tenantId,
                    'subject_type' => $subjectType,
                    'subject_id' => $subjectId,
                    'component_type' => (string) $line['component_type'],
                    'component_id' => (int) $line['component_id'],
                    'quantity' => (float) $line['quantity'],
                    'waste_percent' => (float) ($line['waste_percent'] ?? 0),
                    'unit' => $line['unit'] ?? null,
                    'note' => $line['note'] ?? null,
                    'sort_order' => $order,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });

        $unitCost = $this->costing->syncProductCost($tenantId, $model->id);
        $cost = $this->costing->plateCost($tenantId, $subjectType, $subjectId);

        return response()->json([
            'data' => [
                'lines' => $cost['lines'],
                'unit_cost_minor' => $cost['unit_cost_minor'],
                'complete' => $cost['complete'],
                'missing' => $cost['missing'],
                'synced_product_cost_minor' => $unitCost,
                'margin' => $this->margin((int) $model->price_minor, $cost['unit_cost_minor']),
            ],
        ]);
    }

    /**
     * How many menu items have a recipe, and what the menu's average margin looks like.
     *
     * The number that tells a manager whether the feature is actually in use, instead of a
     * screen that is built and ignored.
     */
    public function overview(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $products = Product::query()
            ->where('tenant_id', $tenantId)
            ->orderBy('name')
            ->limit(500)
            ->get(['id', 'name', 'price_minor', 'purchase_price_minor', 'cost_is_estimated', 'category_id']);

        $withRecipe = DB::table('recipe_lines')
            ->where('tenant_id', $tenantId)
            ->where('subject_type', RecipeCosting::SUBJECT_PRODUCT)
            ->distinct()
            ->pluck('subject_id')
            ->flip();

        $rows = [];
        $costedCount = 0;
        $sumMarginPercent = 0.0;

        foreach ($products as $product) {
            $hasRecipe = $withRecipe->has($product->id);
            // Costing every product on every page load would be a query per product. Only the
            // ones with a recipe are rolled up; the rest fall back to their typed cost.
            $unitCost = $hasRecipe
                ? $this->costing->plateCost($tenantId, RecipeCosting::SUBJECT_PRODUCT, $product->id)['unit_cost_minor']
                : (float) ($product->purchase_price_minor ?? 0);

            $margin = $this->margin((int) $product->price_minor, $unitCost);
            if ($unitCost > 0) {
                $costedCount++;
                $sumMarginPercent += (float) ($margin['margin_percent'] ?? 0);
            }

            $rows[] = [
                'id' => $product->id,
                'name' => $product->name,
                'price_minor' => (int) $product->price_minor,
                'unit_cost_minor' => round($unitCost, 2),
                'has_recipe' => $hasRecipe,
                'cost_is_estimated' => ! $hasRecipe,
                'margin_percent' => $margin['margin_percent'],
            ];
        }

        return response()->json([
            'data' => $rows,
            'meta' => [
                'products' => count($rows),
                'costed' => $costedCount,
                'with_recipe' => $withRecipe->count(),
                'average_margin_percent' => $costedCount > 0 ? round($sumMarginPercent / $costedCount, 2) : null,
            ],
        ]);
    }

    /**
     * A purchase: stock in at a price, moving the weighted average.
     *
     * The single most important call in the module — every plate cost and every COGS figure
     * downstream is only as good as the prices recorded here.
     */
    public function receive(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'subject_type' => ['nullable', Rule::in([RecipeCosting::SUBJECT_ACC_PRODUCT, RecipeCosting::SUBJECT_PRODUCT])],
            'subject_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'unit_cost_minor' => ['required', 'numeric', 'min:0'],
            'unit' => ['nullable', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $this->costing->receive(
            $tenantId,
            (string) ($data['subject_type'] ?? RecipeCosting::SUBJECT_ACC_PRODUCT),
            (int) $data['subject_id'],
            (float) $data['quantity'],
            (float) $data['unit_cost_minor'],
            [
                'unit' => $data['unit'] ?? null,
                'note' => $data['note'] ?? null,
                'reference_type' => 'manual_receipt',
            ],
        );

        return response()->json(['data' => $result], 201);
    }

    /** Waste and adjustments. A reason is required: unexplained shrinkage is not a category. */
    public function waste(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'subject_type' => ['nullable', Rule::in([RecipeCosting::SUBJECT_ACC_PRODUCT, RecipeCosting::SUBJECT_PRODUCT])],
            'subject_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'reason' => ['required', 'string', 'max:255'],
            'kind' => ['nullable', Rule::in(['waste', 'count'])],
            'counted_quantity' => ['nullable', 'numeric', 'min:0'],
        ]);

        $subjectType = (string) ($data['subject_type'] ?? RecipeCosting::SUBJECT_ACC_PRODUCT);
        $subjectId = (int) $data['subject_id'];

        if (($data['kind'] ?? 'waste') === 'count') {
            $result = $this->costing->adjustToCount(
                $tenantId,
                $subjectType,
                $subjectId,
                (float) ($data['counted_quantity'] ?? 0),
                ['note' => $data['reason']],
            );

            return response()->json(['data' => $result]);
        }

        $value = $this->costing->consume(
            $tenantId,
            $subjectType,
            $subjectId,
            (float) $data['quantity'],
            RecipeCosting::REASON_WASTE,
            ['note' => $data['reason']],
        );

        return response()->json(['data' => ['value_minor' => $value]], 201);
    }

    /** Current stock and cost per item, with a reorder flag from the stored reorder point. */
    public function stock(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $lowOnly = $request->boolean('low_only');

        // The reorder point lives per warehouse, not per product, so it is summed across the
        // warehouses that stock the item. A shop with one store sees the same number; one with
        // a kitchen store and a bar store sees the total they must not fall below.
        $rows = DB::table('ingredient_costs as ic')
            ->leftJoin('acc_products as p', function ($join): void {
                $join->on('p.id', '=', 'ic.subject_id')->where('ic.subject_type', '=', RecipeCosting::SUBJECT_ACC_PRODUCT);
            })
            ->leftJoin('acc_warehouse_stock as ws', function ($join): void {
                $join->on('ws.product_id', '=', 'ic.subject_id')->where('ic.subject_type', '=', RecipeCosting::SUBJECT_ACC_PRODUCT);
            })
            ->where('ic.tenant_id', $tenantId)
            ->select([
                'ic.subject_type',
                'ic.subject_id',
                'ic.avg_cost_minor',
                'ic.last_cost_minor',
                'ic.qty_on_hand',
                'ic.unit',
                'p.name as product_name',
                DB::raw('SUM(ws.reorder_point) as reorder_point'),
            ])
            ->groupBy([
                'ic.id', 'ic.subject_type', 'ic.subject_id', 'ic.avg_cost_minor',
                'ic.last_cost_minor', 'ic.qty_on_hand', 'ic.unit', 'p.name',
            ])
            ->orderBy('ic.qty_on_hand')
            ->limit(500)
            ->get()
            ->map(fn ($row) => [
                'subject_type' => $row->subject_type,
                'subject_id' => (int) $row->subject_id,
                'name' => $row->product_name ?? ('#'.$row->subject_id),
                'qty_on_hand' => (float) $row->qty_on_hand,
                'unit' => $row->unit,
                'avg_cost_minor' => (float) $row->avg_cost_minor,
                'last_cost_minor' => (float) $row->last_cost_minor,
                'reorder_point' => $row->reorder_point === null ? null : (float) $row->reorder_point,
                'needs_reorder' => $row->reorder_point !== null && (float) $row->qty_on_hand <= (float) $row->reorder_point,
            ])
            ->when($lowOnly, fn ($rows) => $rows->where('needs_reorder', true))
            ->values();

        return response()->json(['data' => $rows]);
    }

    /**
     * @return array{gross_minor: int, margin_minor: int, margin_percent: float|null}
     */
    private function margin(int $priceMinor, float $costMinor): array
    {
        $gross = $priceMinor - (int) round($costMinor);

        return [
            'gross_minor' => $gross,
            'margin_minor' => $gross,
            // A margin against a zero price is undefined, not infinite.
            'margin_percent' => $priceMinor > 0 ? round(($gross / $priceMinor) * 100, 2) : null,
        ];
    }
}
