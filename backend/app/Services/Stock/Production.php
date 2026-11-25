<?php

namespace App\Services\Stock;

use App\Services\Catalog\RecipeCosting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Making something out of something else — bread, cold brew, a sauce base.
 *
 * The problem this solves is not arithmetic, it is that stock moves twice:
 *
 *   the flour leaves the shelf, and the dough appears on it.
 *
 * Before this existed a shop could record either half and never both. Recording only the
 * output makes stock appear from nowhere, free. Recording only the input loses the resulting
 * goods entirely, so they get counted back in at a physical count as "found" — which is the
 * exact path by which a stock ledger stops being trusted and starts being ignored.
 *
 * Three rules shape the implementation:
 *
 *  1. **The output is valued at what the inputs cost.** Receiving it at any other price
 *     creates or destroys value on every bake, and the ledger stops balancing. `input_value`
 *     is computed from the actual weighted-average cost consumed, never from the output's own
 *     purchase price.
 *
 *  2. **The consumed quantities are frozen on the run.** A recipe edited next week must not
 *     change what last Tuesday's bake ate. The lines store the numbers, not a pointer to a
 *     recipe that may move.
 *
 *  3. **An uncosted component makes the run a floor, not a fact.** If flour has no cost, the
 *     bread's unit cost is reported as incomplete rather than as a confident number that
 *     silently understates every dish using it.
 */
final class Production
{
    public function __construct(
        private readonly StockLedger $stock,
        private readonly RecipeCosting $costing,
    ) {}

    /**
     * Build a draft run from the output's recipe, scaled to what was actually produced.
     *
     * Nothing is written to stock yet: a draft is a plan someone can read and correct, and the
     * quantities on it are the recipe's opinion until a person confirms the bake.
     *
     * @return array<string, mixed>
     */
    public function draft(int $tenantId, int $outputId, float $producedQuantity, array $options = []): array
    {
        if ($producedQuantity <= 0) {
            throw ValidationException::withMessages([
                'produced_quantity' => 'مقدار تولید باید بزرگ‌تر از صفر باشد.',
            ]);
        }

        $recipe = $this->costing->plateCost($tenantId, RecipeCosting::SUBJECT_ACC_PRODUCT, $outputId);

        if ($recipe['lines'] === []) {
            // A run without a recipe has nothing to consume, so it would create stock from
            // nothing. That is the precise failure this service exists to prevent.
            throw ValidationException::withMessages([
                'output_id' => 'برای این کالا رسپی تولید تعریف نشده است؛ بدون رسپی، موجودی از هوا ساخته می‌شود.',
            ]);
        }

        // The recipe states one batch. A larger run consumes proportionally more.
        $recipeYield = (float) ($options['recipe_yield'] ?? 1);
        if ($recipeYield <= 0) {
            $recipeYield = 1.0;
        }
        $scale = $producedQuantity / $recipeYield;

        $lines = [];
        $inputValue = 0.0;
        $complete = true;

        foreach ($recipe['lines'] as $line) {
            $quantity = round((float) $line['effective_quantity'] * $scale, 4);
            $value = round($quantity * (float) $line['unit_cost_minor'], 4);

            if (! $line['cost_known']) {
                $complete = false;
            }

            $inputValue += $value;

            $lines[] = [
                'component_type' => (string) $line['component_type'],
                'component_id' => (int) $line['component_id'],
                'quantity' => $quantity,
                'unit_cost_minor' => (float) $line['unit_cost_minor'],
                'consumed_value_minor' => $value,
                'unit' => $line['unit'],
                'cost_known' => (bool) $line['cost_known'],
            ];
        }

        $runId = DB::table('production_runs')->insertGetId([
            'tenant_id' => $tenantId,
            'output_type' => RecipeCosting::SUBJECT_ACC_PRODUCT,
            'output_id' => $outputId,
            'recipe_yield' => $recipeYield,
            'produced_quantity' => $producedQuantity,
            'warehouse_id' => $options['warehouse_id'] ?? null,
            'batch_no' => $this->trimOrNull($options['batch_no'] ?? null),
            'slot' => $this->trimOrNull($options['slot'] ?? null),
            'expires_on' => $options['expires_on'] ?? null,
            'input_value_minor' => round($inputValue, 4),
            'output_unit_cost_minor' => $producedQuantity > 0 ? round($inputValue / $producedQuantity, 6) : 0,
            'status' => 'draft',
            'note' => $this->trimOrNull($options['note'] ?? null),
            'created_by' => $options['created_by'] ?? (auth()->id() ?? null),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ($lines as $line) {
            DB::table('production_run_lines')->insert($line + [
                'tenant_id' => $tenantId,
                'production_run_id' => $runId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $this->present($tenantId, (int) $runId) + ['cost_complete' => $complete];
    }

    /**
     * Actually make it: consume the inputs, receive the output, in one transaction.
     *
     * Both halves happen together or not at all. A half-posted run is worse than no run: the
     * flour is gone and the bread does not exist, and nothing on screen says which half failed.
     *
     * @return array<string, mixed>
     */
    public function complete(int $tenantId, int $runId): array
    {
        $run = DB::table('production_runs')
            ->where('tenant_id', $tenantId)
            ->where('id', $runId)
            ->first();

        if ($run === null) {
            throw ValidationException::withMessages(['id' => 'این دستور تولید یافت نشد.']);
        }

        if ((string) $run->status !== 'draft') {
            throw ValidationException::withMessages([
                'id' => 'این دستور تولید قبلاً ثبت شده است؛ اجرای دوباره آن موجودی را دو بار می‌سازد.',
            ]);
        }

        $lines = DB::table('production_run_lines')
            ->where('tenant_id', $tenantId)
            ->where('production_run_id', $runId)
            ->get();

        if ($lines->isEmpty()) {
            throw ValidationException::withMessages(['id' => 'دستور تولید بدون اجزا اجرا نمی‌شود.']);
        }

        $inputValue = 0.0;

        return DB::transaction(function () use ($tenantId, $run, $lines, $runId, &$inputValue): array {
            foreach ($lines as $line) {
                // Only stocked items can be consumed. A component that is itself a menu product
                // has no shelf to take from, and pretending otherwise would drive a phantom
                // negative quantity into the ledger.
                if ((string) $line->component_type !== RecipeCosting::SUBJECT_ACC_PRODUCT) {
                    throw ValidationException::withMessages([
                        'lines' => 'همه اجزای رسپی تولید باید کالای انبار باشند.',
                    ]);
                }

                $this->stock->issue(
                    $tenantId,
                    (int) $line->component_id,
                    (float) $line->quantity,
                    'تولید داخلی — دستور #'.$runId,
                    [
                        'warehouse_id' => $run->warehouse_id,
                        'reference_type' => 'production_run',
                        'reference_id' => $runId,
                        // Consumed as production, not as waste: the two are reported apart.
                        'reason_code' => RecipeCosting::REASON_PRODUCTION,
                        'note' => trim('اجزای دستور تولید #'.$runId),
                    ],
                );

                $inputValue += (float) $line->consumed_value_minor;
            }

            $produced = (float) $run->produced_quantity;
            $unitCost = $produced > 0 ? round($inputValue / $produced, 6) : 0.0;

            $this->stock->receive(
                $tenantId,
                (int) $run->output_id,
                $produced,
                $unitCost,
                [
                    'warehouse_id' => $run->warehouse_id,
                    'batch_no' => $run->batch_no,
                    'slot' => $run->slot,
                    'expires_on' => $run->expires_on,
                    'reference_type' => 'production_run',
                    'reference_id' => $runId,
                    'note' => 'تولید داخلی — دستور #'.$runId,
                ],
            );

            DB::table('production_runs')->where('id', $runId)->update([
                'input_value_minor' => round($inputValue, 4),
                'output_unit_cost_minor' => $unitCost,
                'status' => 'completed',
                'completed_at' => now(),
                'updated_at' => now(),
            ]);

            return $this->present($tenantId, $runId);
        });
    }

    /** @return array<string, mixed> */
    public function present(int $tenantId, int $runId): array
    {
        $run = DB::table('production_runs')->where('tenant_id', $tenantId)->where('id', $runId)->first();

        if ($run === null) {
            throw ValidationException::withMessages(['id' => 'این دستور تولید یافت نشد.']);
        }

        $lines = DB::table('production_run_lines as l')
            ->leftJoin('acc_products as p', 'p.id', '=', 'l.component_id')
            ->where('l.tenant_id', $tenantId)
            ->where('l.production_run_id', $runId)
            // `base_unit` is the accounting module's column; `unit` is the original one and is
            // what older rows carry, so the display falls back rather than showing blank.
            ->select(['l.*', 'p.name as component_name', 'p.base_unit', 'p.unit'])
            ->orderBy('l.id')
            ->get();

        $output = DB::table('acc_products')->where('id', $run->output_id)->first(['id', 'name', 'base_unit', 'unit']);

        return [
            'id' => (int) $run->id,
            'status' => (string) $run->status,
            'output' => [
                'id' => (int) $run->output_id,
                'name' => $output?->name,
                'unit' => $output?->base_unit ?? $output?->unit,
            ],
            'produced_quantity' => (float) $run->produced_quantity,
            'recipe_yield' => (float) $run->recipe_yield,
            'warehouse_id' => $run->warehouse_id === null ? null : (int) $run->warehouse_id,
            'batch_no' => $run->batch_no,
            'slot' => $run->slot,
            'expires_on' => $run->expires_on,
            'input_value_minor' => (float) $run->input_value_minor,
            'output_unit_cost_minor' => (float) $run->output_unit_cost_minor,
            'completed_at' => $run->completed_at,
            'note' => $run->note,
            'lines' => $lines->map(fn ($line): array => [
                'component_id' => (int) $line->component_id,
                'component_name' => $line->component_name ?? '#'.$line->component_id,
                'quantity' => (float) $line->quantity,
                'unit' => $line->unit ?? $line->base_unit,
                'unit_cost_minor' => (float) $line->unit_cost_minor,
                'consumed_value_minor' => (float) $line->consumed_value_minor,
                'cost_known' => (bool) $line->cost_known,
            ])->all(),
            // Reported rather than hidden: a run costed from an uncosted ingredient understates
            // the output's value, and every dish built on it inherits that.
            'cost_complete' => $lines->every(fn ($line): bool => (bool) $line->cost_known),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function recent(int $tenantId, int $limit = 25): array
    {
        return DB::table('production_runs as r')
            ->leftJoin('acc_products as p', 'p.id', '=', 'r.output_id')
            ->where('r.tenant_id', $tenantId)
            ->orderByDesc('r.id')
            ->limit(max(1, min(100, $limit)))
            ->get(['r.id', 'r.status', 'r.produced_quantity', 'r.input_value_minor', 'r.output_unit_cost_minor', 'r.batch_no', 'r.slot', 'r.completed_at', 'r.created_at', 'p.name as output_name'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'status' => (string) $row->status,
                'output_name' => $row->output_name ?? '#',
                'produced_quantity' => (float) $row->produced_quantity,
                'input_value_minor' => (float) $row->input_value_minor,
                'output_unit_cost_minor' => (float) $row->output_unit_cost_minor,
                'batch_no' => $row->batch_no,
                'slot' => $row->slot,
                'completed_at' => $row->completed_at,
                'created_at' => $row->created_at,
            ])->all();
    }

    private function trimOrNull(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }
}
