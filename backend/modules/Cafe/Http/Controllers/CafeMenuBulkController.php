<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Adding twenty dishes at once, and changing prices without guessing what happens.
 *
 * Two things a café actually does to a menu, both of which used to be either impossible or
 * blind:
 *
 *  - **Bulk add.** Opening the menu for a new season means twenty new items. The one-at-a-time
 *    form is where that project dies, so this takes a list of names and prices and reports, per
 *    row, what it created and what it refused.
 *  - **Bulk price change with a preview.** A 10% rise is not 10% more profit; it depends on
 *    each item's cost and on the ones with a locked price. The preview computes both sides
 *    before anything is written, which is the difference between a decision and a gamble.
 */
class CafeMenuBulkController extends Controller
{
    /**
     * What a bulk price change would do, without doing it.
     *
     * Returned per item so the screen can show the new price *and* the new margin — the second
     * number is the one that decides whether to apply it.
     */
    public function previewPrice(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'product_ids' => ['required', 'array', 'min:1', 'max:500'],
            'product_ids.*' => ['integer'],
            'percent' => ['required', 'numeric', 'min:-90', 'max:400'],
        ]);

        $products = Product::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $data['product_ids'])
            ->get(['id', 'name', 'price_minor', 'purchase_price_minor', 'lock_price', 'is_sold_out']);

        $rows = $products->map(function (Product $product) use ($data): array {
            $current = (int) $product->price_minor;
            $locked = (bool) $product->lock_price;
            $next = $locked
                ? $current
                : max(0, (int) round($current * (100 + (float) $data['percent']) / 100));

            $cost = (int) ($product->purchase_price_minor ?? 0);

            // Margin as a share of price, and null when there is no cost to compare against:
            // printing "100%" for an uncosted item would look like the best seller on the menu.
            $margin = fn (int $price): ?float => $price > 0 && $cost > 0
                ? round((($price - $cost) / $price) * 100, 2)
                : null;

            return [
                'id' => (int) $product->id,
                'name' => $product->name,
                'current_price_minor' => $current,
                'new_price_minor' => $next,
                'delta_minor' => $next - $current,
                'cost_minor' => $cost,
                'current_margin_percent' => $margin($current),
                'new_margin_percent' => $margin($next),
                'locked' => $locked,
                'skipped' => $locked,
            ];
        })->values()->all();

        $changed = array_values(array_filter($rows, fn (array $row): bool => ! $row['skipped']));

        return response()->json(['data' => [
            'rows' => $rows,
            'changed' => count($changed),
            'skipped' => count($rows) - count($changed),
            'total_before_minor' => array_sum(array_column($rows, 'current_price_minor')),
            'total_after_minor' => array_sum(array_column($rows, 'new_price_minor')),
        ]]);
    }

    /**
     * Create many products in one form.
     *
     * Deliberately per-row: a bad row is reported with its number and skipped, rather than
     * failing the whole batch. Someone pasting twenty lines should not lose the nineteen that
     * were fine because the twentieth had no price.
     */
    public function storeItems(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.name' => ['required', 'string', 'max:191'],
            'items.*.price_minor' => ['required', 'numeric', 'min:0'],
            'items.*.description' => ['nullable', 'string', 'max:1000'],
            'items.*.category_id' => ['nullable', 'integer'],
            'items.*.menu_id' => ['nullable', 'integer'],
            'items.*.sku' => ['nullable', 'string', 'max:60'],
            'items.*.cost_minor' => ['nullable', 'numeric', 'min:0'],
        ]);

        $created = [];
        $failed = [];

        DB::transaction(function () use ($tenantId, $data, &$created, &$failed): void {
            foreach ($data['items'] as $index => $row) {
                $line = $index + 1;
                $name = trim((string) $row['name']);

                if ($name === '') {
                    $failed[] = ['line' => $line, 'reason' => __('api.bulk_item_name_required')];
                    continue;
                }

                // Zero is a valid price for a free item; a missing one is not, which is why the
                // rule is `required` and not `min:1`.
                $product = Product::query()->create([
                    'tenant_id' => $tenantId,
                    'name' => $name,
                    'slug' => $this->uniqueSlug($tenantId, $name),
                    'price_minor' => (int) round((float) $row['price_minor']),
                    'purchase_price_minor' => isset($row['cost_minor']) ? (int) round((float) $row['cost_minor']) : null,
                    'description' => $row['description'] ?? null,
                    'category_id' => $row['category_id'] ?? null,
                    'menu_id' => $row['menu_id'] ?? null,
                    'sku' => $row['sku'] ?? null,
                    'status' => 'publish',
                    'is_available' => true,
                    'is_hidden' => false,
                    'currency' => 'IRT',
                ]);

                $created[] = ['line' => $line, 'id' => (int) $product->id, 'name' => $product->name];
            }
        });

        return response()->json(['data' => [
            'created' => $created,
            'failed' => $failed,
            'created_count' => count($created),
            'failed_count' => count($failed),
        ]], $failed === [] ? 201 : 207);
    }

    private function uniqueSlug(int $tenantId, string $name): string
    {
        $base = Str::slug($name) ?: 'item';
        $slug = $base;
        $suffix = 2;

        while (Product::query()->where('tenant_id', $tenantId)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }
}
